// Briefing: 任務の 6 行（目的・成功・月・敵・危険・条件）と史実の 1 行、出撃前の港内空襲の 2 択、「出撃」（docs/02 §4・§6.8、v0.4.0）。
// 数値は world-setup で Mission と同じに組む（?debug の上書き込み）。空襲は create で 1 回だけ振り（seed+4）、選んだ Sortie を Mission に渡す。
// 静的な画面: 物体は create で 1 回だけ作り、update は持たない。変わるのは選択の 1 回だけ（§7）。
import Phaser from 'phaser';
import {
  DEBUG_DAWN_S,
  DEBUG_FUEL_ALLOTMENT_GAL,
  DEBUG_RAID_OVERRIDE,
  DEBUG_STORM_OFF,
  DEPTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_PENDING_SORTIE,
  RENDER_SCALE,
  SCENE_KEYS,
  sortieSeed,
} from '../config/game-config';
import { getGameData } from '../config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../config/mission-data';
import {
  BRIEF_BACK_H,
  BRIEF_BACK_JA,
  BRIEF_BACK_PX,
  BRIEF_BACK_W,
  BRIEF_BACK_X,
  BRIEF_BACK_Y,
  BRIEF_CALM_PX,
  BRIEF_CHOICE_GAP,
  BRIEF_CHOICE_H,
  BRIEF_CHOICE_TITLE_PX,
  BRIEF_CHOICE_W,
  BRIEF_CHOICE_Y,
  BRIEF_NOTE_GAP,
  BRIEF_NOTE_LABEL_JA,
  BRIEF_NOTE_PX,
  BRIEF_OUTCOME_PX,
  BRIEF_OUTCOME_WRAP,
  BRIEF_OUTCOME_Y,
  BRIEF_RAID_PX,
  BRIEF_RAID_Y,
  BRIEF_ROW_GAP,
  BRIEF_ROW_PX,
  BRIEF_ROW_TOP,
  BRIEF_SORTIE_H,
  BRIEF_SORTIE_JA,
  BRIEF_SORTIE_PX,
  BRIEF_SORTIE_WAIT_JA,
  BRIEF_SORTIE_Y,
  BRIEF_SUB_PX,
  BRIEF_SUB_Y,
  BRIEF_TITLE_PX,
  BRIEF_TITLE_Y,
  BRIEF_VALUE_WRAP,
  BRIEF_VALUE_X,
  BRIEF_X,
  MENU_PRIMARY_W,
  MENU_PRIMARY_X,
} from '../config/menu-config';
import { HOME_COLOR_TEXT, HUD_COLOR, HUD_COLOR_STRONG, HUD_COLOR_WARN, hudTextStyle } from '../config/ui-config';
import { briefingRows, formatDateJa } from '../core/briefing';
import {
  RAID_ALERT_JA,
  RAID_CALM_JA,
  RAID_DISPERSE,
  RAID_NONE,
  RAID_STAY,
  isBriefingInit,
  raidChoiceText,
  raidOutcomeText,
  rollRaid,
  type RaidParams,
  type Sortie,
} from '../core/sortie';
import { briefingNumbers, buildWorldSetup } from '../systems/world-setup';
import { MenuButton, addBuildLabel, menuWrapStyle } from '../ui/menu-ui';

export class BriefingScene extends Phaser.Scene {
  /** この出撃（create で空襲を振る。ヘッドレスが読む） */
  sortie!: Sortie;
  private missionId = PROTOTYPE_MISSION_ID;
  private seed = 0;
  /** 難易度ハード（v0.4.5。Title から） */
  private hard = false;
  private raid: RaidParams | null = null;
  /** 2 択（[分散, 残る]。空襲の夜だけ） */
  private options: MenuButton[] = [];
  private go?: MenuButton;
  private back?: MenuButton;
  private outcome?: Phaser.GameObjects.Text;
  /** 二重遷移の防止（同じフレームで 2 度 scene.start すると 2 つ起動する） */
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.briefing);
  }

  init(d: unknown): void {
    // 呼ぶ側は必ず BriefingInit を渡す（Phaser は data を省くと前回の data を使い回す）。外れたら us_02・新しい seed
    if (isBriefingInit(d)) {
      this.missionId = d.missionId;
      this.seed = d.seed;
      this.hard = d.hard;
    } else {
      this.missionId = PROTOTYPE_MISSION_ID;
      this.seed = sortieSeed();
      this.hard = false;
    }
    this.options = [];
    this.go = undefined;
    this.back = undefined;
    this.outcome = undefined;
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.leaving = false;
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const id = this.missionId;
    // Mission と同じ組み立て（?debug の上書き込み）。空襲の有無と強さもここから
    const setup = buildWorldSetup(data, id, DEBUG_FUEL_ALLOTMENT_GAL, DEBUG_DAWN_S, DEBUG_STORM_OFF, null, false, false, false, this.hard);
    const p = setup.raid;
    this.raid = p;
    this.sortie = rollRaid(id, this.seed, p, DEBUG_RAID_OVERRIDE, this.hard);
    const rec = getBriefingRecord(data, id, this.hard);

    addBuildLabel(this);
    this.add.text(BRIEF_X, BRIEF_SUB_Y, `${formatDateJa(rec.date)} ・ ${rec.place}${this.hard ? ' ・ 難易度 ハード' : ''}`, hudTextStyle(BRIEF_SUB_PX, HUD_COLOR)).setDepth(DEPTH.hud);
    this.add.text(BRIEF_X, BRIEF_TITLE_Y, rec.titleJa, hudTextStyle(BRIEF_TITLE_PX, HUD_COLOR_STRONG)).setDepth(DEPTH.hud);

    // 6 行: ラベルと値（値は折り返し、次の行は値の高さぶん下げる）。続けて史実の 1 行
    let y = BRIEF_ROW_TOP;
    const rows = briefingRows(rec, briefingNumbers(setup), (e) => enemyNameJa(data, e), (h) => riskLabelJa(data, h));
    for (const r of rows) {
      this.add.text(BRIEF_X, y, r.label, hudTextStyle(BRIEF_ROW_PX, HUD_COLOR)).setDepth(DEPTH.hud);
      const v = this.add.text(BRIEF_VALUE_X, y, r.text, menuWrapStyle(BRIEF_ROW_PX, HUD_COLOR_STRONG, BRIEF_VALUE_WRAP)).setDepth(DEPTH.hud);
      y += v.height + BRIEF_ROW_GAP;
    }
    y += BRIEF_NOTE_GAP;
    this.add.text(BRIEF_X, y, BRIEF_NOTE_LABEL_JA, hudTextStyle(BRIEF_NOTE_PX, HUD_COLOR)).setDepth(DEPTH.hud);
    this.add.text(BRIEF_VALUE_X, y, rec.noteJa, menuWrapStyle(BRIEF_NOTE_PX, HUD_COLOR, BRIEF_VALUE_WRAP)).setDepth(DEPTH.hud);

    // 出撃前の港内空襲（任務の危険にあるときだけ）: 空襲の夜は 2 択、そうでなければ「異状なし」
    const s = this.sortie;
    if (p) {
      if (s.raid) {
        this.add.text(BRIEF_X, BRIEF_RAID_Y, RAID_ALERT_JA, hudTextStyle(BRIEF_RAID_PX, HUD_COLOR_WARN)).setDepth(DEPTH.hud);
        [RAID_DISPERSE, RAID_STAY].forEach((c, i) => {
          const t = raidChoiceText(p, c);
          const spec = {
            x: BRIEF_X + i * (BRIEF_CHOICE_W + BRIEF_CHOICE_GAP),
            y: BRIEF_CHOICE_Y,
            w: BRIEF_CHOICE_W,
            h: BRIEF_CHOICE_H,
            title: t.title,
            titlePx: BRIEF_CHOICE_TITLE_PX,
            sub: t.detail,
            align: 'center' as const,
          };
          this.options.push(new MenuButton(this, spec, () => this.choose(c)));
        });
        this.outcome = this.add.text(BRIEF_X, BRIEF_OUTCOME_Y, '', menuWrapStyle(BRIEF_OUTCOME_PX, HUD_COLOR_STRONG, BRIEF_OUTCOME_WRAP)).setDepth(DEPTH.hud);
      } else {
        this.add.text(BRIEF_X, BRIEF_RAID_Y, RAID_CALM_JA, hudTextStyle(BRIEF_CALM_PX, HUD_COLOR)).setDepth(DEPTH.hud);
      }
    }

    const waiting = s.raid && s.choice === RAID_NONE;
    const goSpec = { x: MENU_PRIMARY_X, y: BRIEF_SORTIE_Y, w: MENU_PRIMARY_W, h: BRIEF_SORTIE_H, title: BRIEF_SORTIE_JA, titlePx: BRIEF_SORTIE_PX, sub: waiting ? BRIEF_SORTIE_WAIT_JA : '', align: 'center' as const };
    this.go = new MenuButton(this, goSpec, () => this.sortieNow());
    this.go.setEnabled(!waiting);
    const backSpec = { x: BRIEF_BACK_X, y: BRIEF_BACK_Y, w: BRIEF_BACK_W, h: BRIEF_BACK_H, title: BRIEF_BACK_JA, titlePx: BRIEF_BACK_PX, align: 'center' as const };
    // 任務一覧へ（選ぶ前だけ。registry の保留は残すので、同じ任務を選び直すと同じ夜）
    this.back = new MenuButton(this, backSpec, () => {
      if (this.leaving) return;
      this.leaving = true;
      this.scene.start(SCENE_KEYS.title);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const o of this.options) o.destroy();
      this.options = [];
      this.go?.destroy();
      this.go = undefined;
      this.back?.destroy();
      this.back = undefined;
      this.outcome = undefined;
    });
  }

  /** 空襲の 2 択（空襲の夜に 1 回だけ。ヘッドレスからも呼べる） */
  choose(c: number): void {
    const s = this.sortie;
    const p = this.raid;
    if (!p || !s.raid || s.choice !== RAID_NONE || (c !== RAID_DISPERSE && c !== RAID_STAY)) return;
    s.choice = c;
    const color = c === RAID_DISPERSE ? HUD_COLOR_STRONG : s.stayHit ? HUD_COLOR_WARN : HOME_COLOR_TEXT;
    this.outcome?.setText(raidOutcomeText(s, p)).setColor(color);
    this.options[c - 1]?.setSelected(true);
    this.options[2 - c]?.setEnabled(false);
    this.back?.setEnabled(false);
    this.go?.setEnabled(true);
    this.go?.setSub('');
  }

  /** 出撃（空襲の夜は選んだ後だけ）: 保留を消して Mission へ */
  private sortieNow(): void {
    if (this.leaving) return;
    if (this.sortie.raid && this.sortie.choice === RAID_NONE) return;
    this.leaving = true;
    this.registry.set(REGISTRY_KEY_PENDING_SORTIE, null);
    this.scene.start(SCENE_KEYS.mission, this.sortie);
  }
}
