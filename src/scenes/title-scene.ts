// Title: ゲーム名と任務一覧（米PTキャンペーンの playable_from を持つ任務を order 順。出撃できない任務は「準備中 ・ 版」で押せない）。docs/02 §4、v0.4.0。
// v0.6.0: キャンペーンのタブ（米PT｜日本ハードモード）。日本側は米PTの遊べる任務を 1 回ずつ帰投で終えると開く（core/campaign。一度開いたら閉じない）。
// 静的な画面: 物体は create で 1 回だけ作り、update は持たない（§7）。任務を選ぶと出撃の seed を決めて Briefing へ。
import Phaser from 'phaser';
import { DEBUG_UNLOCK_ALL, DEPTH, GAME_HEIGHT, GAME_WIDTH, REGISTRY_KEY_CAMPAIGN, REGISTRY_KEY_DATA, REGISTRY_KEY_HARD, REGISTRY_KEY_HISTORICAL, REGISTRY_KEY_PENDING_SORTIE, RENDER_SCALE, SCENE_KEYS, sortieSeed } from '../config/game-config';
import { getCampaigns, getMenuEntries, playableMissionIds } from '../config/campaign-data';
import { getAimAssistLevels, getGameData } from '../config/game-data';
import {
  TITLE_DIFF_H,
  TITLE_DIFF_HARD_JA,
  TITLE_DIFF_NORMAL_JA,
  TITLE_DIFF_PX,
  TITLE_DIFF_SUB_JA,
  TITLE_DIFF_W,
  TITLE_DIFF_X,
  TITLE_DIFF_Y,
  TITLE_HINT_BY_CAMPAIGN_JA,
  TITLE_HINT_JA,
  TITLE_HINT_PX,
  TITLE_HINT_Y,
  TITLE_HIST_OFF_JA,
  TITLE_HIST_ON_JA,
  TITLE_HIST_X,
  TITLE_LOGO_PX,
  TITLE_LOGO_TEXT,
  TITLE_LOGO_Y,
  TITLE_MARKER_JA,
  TITLE_MARKER_LOCKED_JA,
  TITLE_MARKER_OFF_JA,
  TITLE_MARKER_ON_JA,
  TITLE_MARKER_SUB_JA,
  TITLE_MARKER_X,
  TITLE_ROW_GAP,
  TITLE_ROW_H,
  TITLE_ROW_STATUS_PX,
  TITLE_ROW_SUB_PX,
  TITLE_ROW_TITLE_PX,
  TITLE_ROW_TOP,
  TITLE_ROW_W,
  TITLE_ROW_X,
  TITLE_TAB_GAP,
  TITLE_TAB_H,
  TITLE_TAB_PX,
  TITLE_TAB_SELECTED_SUB_JA,
  TITLE_TAB_SUB_JA,
  TITLE_TAB_W,
  TITLE_TAB_Y,
  titleCampaignLockedSubJa,
  titleHistSubJa,
  titleMarkerLockedSubJa,
} from '../config/menu-config';
import { HOME_COLOR_TEXT, HUD_COLOR, HUD_COLOR_STRONG, hudTextStyle } from '../config/ui-config';
import { campaignStatus, type CampaignStatus } from '../core/campaign';
import { AIM_ASSIST_NONE, aimAssistLevelFor, nextAimAssistUnlock } from '../core/progress';
import { seedForBriefing, type BriefingInit } from '../core/sortie';
import { clearedMissionIds, leadMarkerEnabled, markCampaignUnlocked, migrateLegacyUnlocks, setLeadMarkerEnabled, sortiesDone, unlockedCampaignIds } from '../systems/progress-storage';
import { MenuButton, addBuildLabel } from '../ui/menu-ui';

export class TitleScene extends Phaser.Scene {
  private rows: MenuButton[] = [];
  /** キャンペーンのタブ（v0.6.0） */
  private tabs: MenuButton[] = [];
  /** 難易度の切り替え（v0.4.5。registry に持ち回る）と史実モードの切り替え（v0.5.2。同じく registry） */
  private hist?: MenuButton;
  /** 見越し点マーカーの切り替え（v0.5.2 実機 1 回目。localStorage に覚える。解放前は押せない） */
  private marker?: MenuButton;
  private diff?: MenuButton;
  /** 二重遷移の防止（同じフレームで 2 度 scene.start すると 2 つ起動する） */
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.title);
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.leaving = false;
    this.rows = [];
    this.tabs = [];
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const selected = this.selectCampaign();
    const menu = getMenuEntries(data, selected.id);
    const cx = GAME_WIDTH / 2;

    addBuildLabel(this);
    this.add.text(cx, TITLE_LOGO_Y, TITLE_LOGO_TEXT, hudTextStyle(TITLE_LOGO_PX, HUD_COLOR_STRONG)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
    // キャンペーンのタブ（v0.6.0）: 選んでいるタブは枠を強く。未解放は条件と進みを出して押せない。押したら registry に覚えて作り直す（Title は静的な画面。§7）
    const campaigns = getCampaigns(data);
    const tabsLeft = cx - (campaigns.length * TITLE_TAB_W + (campaigns.length - 1) * TITLE_TAB_GAP) / 2;
    campaigns.forEach((c, i) => {
      const st = selected.status.get(c.id)!;
      const u = c.unlock;
      const prereqName = u.kind === 'complete' ? (campaigns.find((x) => x.id === u.campaignId)?.shortJa ?? '') : '';
      const sub = !st.unlocked ? titleCampaignLockedSubJa(prereqName, st.done, st.total) : c.id === selected.id ? TITLE_TAB_SELECTED_SUB_JA : TITLE_TAB_SUB_JA;
      const tab = new MenuButton(this, { x: tabsLeft + i * (TITLE_TAB_W + TITLE_TAB_GAP), y: TITLE_TAB_Y, w: TITLE_TAB_W, h: TITLE_TAB_H, title: c.nameJa, titlePx: TITLE_TAB_PX, sub, align: 'center' }, () => this.switchCampaign(c.id));
      tab.setEnabled(st.unlocked);
      tab.setSelected(c.id === selected.id);
      this.tabs.push(tab);
    });
    menu.entries.forEach((e, i) => {
      const row = new MenuButton(
        this,
        {
          x: TITLE_ROW_X,
          y: TITLE_ROW_TOP + i * (TITLE_ROW_H + TITLE_ROW_GAP),
          w: TITLE_ROW_W,
          h: TITLE_ROW_H,
          title: e.title,
          titlePx: TITLE_ROW_TITLE_PX,
          sub: e.sub,
          subPx: TITLE_ROW_SUB_PX,
          right: e.status,
          rightPx: TITLE_ROW_STATUS_PX,
          rightColor: e.playable ? HOME_COLOR_TEXT : HUD_COLOR,
          align: 'left',
        },
        () => this.open(e.id),
      );
      row.setEnabled(e.playable);
      this.rows.push(row);
    });
    this.add.text(cx, TITLE_HINT_Y, TITLE_HINT_BY_CAMPAIGN_JA[selected.id] ?? TITLE_HINT_JA, hudTextStyle(TITLE_HINT_PX, HUD_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
    // 難易度（v0.4.5）: タップで ノーマル ⇄ ハード。registry に持ち回る（Briefing → Mission → Result の「もう一度」まで同じ難易度）
    const diffSpec = { x: TITLE_DIFF_X, y: TITLE_DIFF_Y, w: TITLE_DIFF_W, h: TITLE_DIFF_H, title: this.hard ? TITLE_DIFF_HARD_JA : TITLE_DIFF_NORMAL_JA, titlePx: TITLE_DIFF_PX, sub: TITLE_DIFF_SUB_JA, align: 'center' as const };
    this.diff = new MenuButton(this, diffSpec, () => {
      this.registry.set(REGISTRY_KEY_HARD, !this.hard);
      this.diff?.setTitle(this.hard ? TITLE_DIFF_HARD_JA : TITLE_DIFF_NORMAL_JA);
      this.diff?.setSelected(this.hard);
    });
    this.diff.setSelected(this.hard);
    // 史実モード（v0.5.2。docs/02 §6.3）: タップで オフ ⇄ オン。題と 2 行目は data の historical_mode から（倍率・不発の確率を直書きしない）
    const hm = getGameData(this.registry, REGISTRY_KEY_DATA).hitRateModel.historical_mode;
    const histTitle = (): string => `${hm.title_ja}${this.historical ? TITLE_HIST_ON_JA : TITLE_HIST_OFF_JA}`;
    const histSpec = { x: TITLE_HIST_X, y: TITLE_DIFF_Y, w: TITLE_DIFF_W, h: TITLE_DIFF_H, title: histTitle(), titlePx: TITLE_DIFF_PX, sub: titleHistSubJa(hm.enemy_evasion_multiplier, hm.reliability_campaigns.includes(selected.id) ? Math.round(hm.reliability.dud * 100) : null), align: 'center' as const };
    this.hist = new MenuButton(this, histSpec, () => {
      this.registry.set(REGISTRY_KEY_HISTORICAL, !this.historical);
      this.hist?.setTitle(histTitle());
      this.hist?.setSelected(this.historical);
    });
    this.hist.setSelected(this.historical);
    // 見越し点マーカー（v0.5.2 実機 1 回目「使うかどうか選択制に」）: 解放前は「未解放」で押せず、2 行目に解放までの回数。解放後はタップで 使う ⇄ 使わない（localStorage）
    const levels = getAimAssistLevels(getGameData(this.registry, REGISTRY_KEY_DATA));
    const done = sortiesDone();
    const unlocked = aimAssistLevelFor(levels, done, false).id !== AIM_ASSIST_NONE;
    const next = nextAimAssistUnlock(levels, done);
    const markerTitle = (): string => `${TITLE_MARKER_JA}${!unlocked ? TITLE_MARKER_LOCKED_JA : leadMarkerEnabled() ? TITLE_MARKER_ON_JA : TITLE_MARKER_OFF_JA}`;
    const markerSpec = { x: TITLE_MARKER_X, y: TITLE_DIFF_Y, w: TITLE_DIFF_W, h: TITLE_DIFF_H, title: markerTitle(), titlePx: TITLE_DIFF_PX, sub: unlocked ? TITLE_MARKER_SUB_JA : titleMarkerLockedSubJa(next ? next.unlockSorties - done : 0), align: 'center' as const };
    this.marker = new MenuButton(this, markerSpec, () => {
      setLeadMarkerEnabled(!leadMarkerEnabled());
      this.marker?.setTitle(markerTitle());
      this.marker?.setSelected(leadMarkerEnabled());
    });
    this.marker.setEnabled(unlocked);
    this.marker.setSelected(unlocked && leadMarkerEnabled());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const r of this.rows) r.destroy();
      this.rows = [];
      for (const t of this.tabs) t.destroy();
      this.tabs = [];
      this.diff?.destroy();
      this.diff = undefined;
      this.hist?.destroy();
      this.hist = undefined;
      this.marker?.destroy();
      this.marker = undefined;
    });
  }

  /**
   * 解放の状態を求め、選んでいるキャンペーンを決める（create で 1 回だけ。localStorage はここで読み書きする）。
   * v0.5.2 までの端末の移し替えは Boot で 1 回（systems/progress-storage の migrateLegacyUnlocks）。
   * 条件を満たしたキャンペーンには開いた印を書く（一度開いたら閉じない。?debug&unlock だけで開いたときは書かない）
   */
  private selectCampaign(): { id: string; status: Map<string, CampaignStatus> } {
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const campaigns = getCampaigns(data);
    const prereq = (c: (typeof campaigns)[number]): string[] => (c.unlock.kind === 'complete' ? playableMissionIds(data, c.unlock.campaignId) : []);
    // v0.5.2 までの端末の移し替えは Boot（migrateLegacyUnlocks）で済んでいる。念のためここでも（2 回目からは何もしない）
    migrateLegacyUnlocks(data);
    const cleared = clearedMissionIds();
    const flagged = unlockedCampaignIds();
    const status = new Map<string, CampaignStatus>();
    for (const c of campaigns) {
      const st = campaignStatus(c.unlock, prereq(c), cleared, flagged.has(c.id), DEBUG_UNLOCK_ALL);
      if (c.unlock.kind === 'complete' && !flagged.has(c.id) && st.total > 0 && st.done === st.total) markCampaignUnlocked(c.id);
      status.set(c.id, st);
    }
    const want = this.registry.get(REGISTRY_KEY_CAMPAIGN);
    const fallback = campaigns.find((c) => c.unlock.kind === 'default')!.id;
    const id = typeof want === 'string' && status.get(want)?.unlocked ? want : fallback;
    return { id, status };
  }

  /** タブを押した: 選んだキャンペーンを registry に覚えて作り直す（二重押しは leaving で防ぐ） */
  private switchCampaign(id: string): void {
    if (this.leaving) return;
    this.leaving = true;
    this.registry.set(REGISTRY_KEY_CAMPAIGN, id);
    this.scene.restart();
  }

  /** 選んでいる難易度（未設定ならノーマル） */
  private get hard(): boolean {
    return this.registry.get(REGISTRY_KEY_HARD) === true;
  }

  /** 選んでいる史実モード（未設定なら data の enabled_default＝オフ） */
  private get historical(): boolean {
    const v = this.registry.get(REGISTRY_KEY_HISTORICAL);
    return typeof v === 'boolean' ? v : getGameData(this.registry, REGISTRY_KEY_DATA).hitRateModel.historical_mode.enabled_default;
  }

  /** 任務を選ぶ: 同じ任務の保留（Briefing で選ぶ前に戻った夜）があればその seed、無ければ新しい seed で Briefing へ */
  private open(missionId: string): void {
    if (this.leaving) return;
    this.leaving = true;
    const init: BriefingInit = { missionId, seed: seedForBriefing(this.registry.get(REGISTRY_KEY_PENDING_SORTIE), missionId, sortieSeed()), hard: this.hard, historical: this.historical };
    this.registry.set(REGISTRY_KEY_PENDING_SORTIE, init);
    this.scene.start(SCENE_KEYS.briefing, init);
  }
}
