// Title: ゲーム名と任務一覧（米PTキャンペーンの playable_from を持つ任務を order 順。出撃できない任務は「準備中 ・ 版」で押せない）。docs/02 §4、v0.4.0。
// 静的な画面: 物体は create で 1 回だけ作り、update は持たない（§7）。任務を選ぶと出撃の seed を決めて Briefing へ。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, REGISTRY_KEY_DATA, REGISTRY_KEY_HARD, REGISTRY_KEY_HISTORICAL, REGISTRY_KEY_PENDING_SORTIE, RENDER_SCALE, SCENE_KEYS, sortieSeed } from '../config/game-config';
import { getGameData } from '../config/game-data';
import { getMenuEntries } from '../config/mission-data';
import {
  TITLE_CAMPAIGN_PX,
  TITLE_CAMPAIGN_SUFFIX_JA,
  TITLE_CAMPAIGN_Y,
  TITLE_DIFF_H,
  TITLE_DIFF_HARD_JA,
  TITLE_DIFF_NORMAL_JA,
  TITLE_DIFF_PX,
  TITLE_DIFF_SUB_JA,
  TITLE_DIFF_W,
  TITLE_DIFF_X,
  TITLE_DIFF_Y,
  TITLE_HINT_JA,
  TITLE_HINT_PX,
  TITLE_HINT_Y,
  TITLE_HIST_OFF_JA,
  TITLE_HIST_ON_JA,
  TITLE_HIST_X,
  TITLE_LOGO_PX,
  TITLE_LOGO_TEXT,
  TITLE_LOGO_Y,
  TITLE_ROW_GAP,
  TITLE_ROW_H,
  TITLE_ROW_STATUS_PX,
  TITLE_ROW_SUB_PX,
  TITLE_ROW_TITLE_PX,
  TITLE_ROW_TOP,
  TITLE_ROW_W,
  TITLE_ROW_X,
  titleHistSubJa,
} from '../config/menu-config';
import { HOME_COLOR_TEXT, HUD_COLOR, HUD_COLOR_STRONG, hudTextStyle } from '../config/ui-config';
import { seedForBriefing, type BriefingInit } from '../core/sortie';
import { MenuButton, addBuildLabel } from '../ui/menu-ui';

export class TitleScene extends Phaser.Scene {
  private rows: MenuButton[] = [];
  /** 難易度の切り替え（v0.4.5。registry に持ち回る）と史実モードの切り替え（v0.5.2。同じく registry） */
  private hist?: MenuButton;
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
    const menu = getMenuEntries(getGameData(this.registry, REGISTRY_KEY_DATA));
    const cx = GAME_WIDTH / 2;

    addBuildLabel(this);
    this.add.text(cx, TITLE_LOGO_Y, TITLE_LOGO_TEXT, hudTextStyle(TITLE_LOGO_PX, HUD_COLOR_STRONG)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
    this.add.text(cx, TITLE_CAMPAIGN_Y, `${menu.campaignName}${TITLE_CAMPAIGN_SUFFIX_JA}`, hudTextStyle(TITLE_CAMPAIGN_PX, HUD_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
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
    this.add.text(cx, TITLE_HINT_Y, TITLE_HINT_JA, hudTextStyle(TITLE_HINT_PX, HUD_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
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
    const histSpec = { x: TITLE_HIST_X, y: TITLE_DIFF_Y, w: TITLE_DIFF_W, h: TITLE_DIFF_H, title: histTitle(), titlePx: TITLE_DIFF_PX, sub: titleHistSubJa(hm.enemy_evasion_multiplier, Math.round(hm.reliability.dud * 100)), align: 'center' as const };
    this.hist = new MenuButton(this, histSpec, () => {
      this.registry.set(REGISTRY_KEY_HISTORICAL, !this.historical);
      this.hist?.setTitle(histTitle());
      this.hist?.setSelected(this.historical);
    });
    this.hist.setSelected(this.historical);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const r of this.rows) r.destroy();
      this.rows = [];
      this.diff?.destroy();
      this.diff = undefined;
      this.hist?.destroy();
      this.hist = undefined;
    });
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
