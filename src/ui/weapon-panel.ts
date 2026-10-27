// HUD の右側のパネル（v0.6.8。spec-v068 §1.2・§4.1〜4.3、実機 1 回目の直し。置き方は config/hud-layout-config の panelLayout）: 魚雷と機銃は全任務で両方（艇が積むもの）。
// 兵装は全任務で同じ位置（main_weapon に関わらず）: 右下の角（列 1・R64・文字 22 px）に魚雷、そのすぐ左（列 2・R56・文字 20 px）に機銃、扇は魚雷の下。
// 技能（R44・文字 20 px。R48 の丸の絵を縮める）は右端に縦一列（上から 煙幕（米）・消火・見張り・識別（味方機の夜）。無いボタンの段は空ける）。兵装の上の 1 行は ui/weapon-cue（このクラスが作って消す）。
// 魚雷・扇・機銃は出だしの 600 ms は受けない（Briefing の「出撃」・Result の「もう一度」の 2 度押し）。技能の中身（煙幕・消火・見張り・識別）は v0.6.7 の hud-scene のまま（S0 で移した）。
// 値が変わったときだけ文字を組む（§7。前回の値はこのクラスが持つ。Hud を作り直すたびにこのクラスも作り直すので前回の値を引きずらない）。
import Phaser from 'phaser';
import { GUN_BUTTON_FONT_PX, GUN_BUTTON_SCALE, GUN_FIRING_ALPHA } from '../config/arms-config';
import { GAME_WIDTH, TEXTURE_KEYS } from '../config/game-config';
import { getBoatSmokeParams, type GameData } from '../config/game-data';
import { R_SKILL, SKILL_FONT_PX, panelLayout, type PanelLayout } from '../config/hud-layout-config';
import { GUN_BUTTON_LABEL } from '../config/hunt-config';
import { getLoadout } from '../config/loadout-data';
import type { PrototypeMission } from '../config/mission-data';
import { HOME_COLOR, IDENTIFY_PULSE_ALPHA_MAX, IDENTIFY_PULSE_HZ, ROUND_BUTTON_ALPHA, ROUND_BUTTON_RADIUS, TORPEDO_BUTTON_ARM_MS } from '../config/ui-config';
import { EV_TORP_EMPTY } from '../core/arms-cue';
import type { BoatTelemetry } from '../core/boat-motion';
import { FF_CHALLENGE, FF_STRAFE } from '../core/friendly';
import type { InputState } from '../core/input-state';
import type { SpreadConfig } from '../core/salvo';
import { HoldButton } from '../systems/hold-button';
import type { Cancelable } from '../systems/pause-control';
import { SpreadButton } from '../systems/spread-button';
import { TorpedoButton } from '../systems/torpedo-button';
import { gunButtonLabel, gunButtonReloadN } from './pt-gun-lines';
import { WeaponCue } from './weapon-cue';

/** 技能のボタンの倍率（R44 / 丸の絵の R48。当たりも絵といっしょに縮む） */
const SKILL_BUTTON_SCALE = R_SKILL / ROUND_BUTTON_RADIUS;

export class WeaponPanel {
  /** 置き方（作るとき 1 回。G8 のヘッドレスの検査も読む） */
  readonly layout: PanelLayout;
  private torpedoButton?: TorpedoButton;
  /** 扇の角度（v0.5.1 実機 1 回目）。魚雷ボタンの下（v0.6.8 から魚雷を積む全任務） */
  private spreadButton?: SpreadButton;
  /** 「機銃」（v0.6.8 から全任務。v0.4.2〜v0.6.7 は主兵装が砲の任務の「射撃」）: 押している間 gunHeld。出だしの 0.6 秒は受けない（「出撃」の 2 度押し） */
  private gunButton?: HoldButton;
  private smokeButton?: HoldButton;
  private extinguishButton?: HoldButton;
  private lookoutButton?: HoldButton;
  /** 「識別」（v0.3.3）。任務に味方機がいるときだけ作る。残り秒の整数が変わったときだけ文字を組む */
  private identifyButton?: HoldButton;
  private readonly cue: WeaponCue;
  private lastIdentifyN = -1;
  private lastHoldTenths = -1;
  private lastReloadN = 0; // 機銃ボタンの弾倉交換の残り秒（0 は交換中でない。v0.6.3 実機 1 回目のレビュー ux-2: 赤い線の下で弾が止まる訳が見えなかった）

  constructor(scene: Phaser.Scene, input: InputState, data: GameData, mission: PrototypeMission, telemetry: BoatTelemetry, spread: SpreadConfig) {
    const launch = data.hitRateModel.torpedo_launch;
    const loadout = getLoadout(data, mission);
    // 煙幕発生器の無い艇（日本の魚雷艇。v0.6.0）は煙幕ボタンを作らない（いちばん上の段は空く）。識別は今夜味方機がいるときだけ（v0.4.6。夜の揺らぎで来ない夜がある）
    const hasSmoke = getBoatSmokeParams(data, mission.playerBoatId) !== null;
    const L = panelLayout(GAME_WIDTH, { smoke: hasSmoke, identify: telemetry.friendlyEnabled });
    this.layout = L;
    this.cue = new WeaponCue(scene, L, telemetry.arms.evSeq);
    // 魚雷（積んでいる本数。撃てない間は薄く受けない。0 本で押すと「魚雷は撃ち尽くした」）と、その下の扇
    if (loadout.torpedoes > 0) {
      this.torpedoButton = new TorpedoButton(scene, input, spread, L.torpedo.x, L.torpedo.y, 1, () => this.cue.local(EV_TORP_EMPTY, scene.time.now));
      this.torpedoButton.setRemaining(telemetry.arms.torpedoesAboard);
      this.torpedoButton.setUsable(telemetry.arms.torpedoUsable);
      this.spreadButton = new SpreadButton(scene, L.spread.x, L.spread.y, L.spread.w, spread, launch.salvo_spacing_deg, launch.salvo_spacing_choices_deg);
    }
    // 機銃（艇の gun_battery。大発・PT・艦・機のどれを撃つかは世界が決める＝砲は 1 つ）
    if (loadout.gun !== null) {
      this.gunButton = new HoldButton(
        scene,
        L.gun.x,
        L.gun.y,
        GUN_BUTTON_LABEL,
        { onDown: () => (input.gunHeld = true), onUp: () => (input.gunHeld = false) },
        TEXTURE_KEYS.gunButton,
        GUN_BUTTON_SCALE,
        { armMs: TORPEDO_BUTTON_ARM_MS, fontPx: GUN_BUTTON_FONT_PX },
      );
    }
    // 技能: 「煙幕」は離すと展開。「消火」は火災中に押し続けると消火（押している時間は Mission が数える。v0.3.1 実機の要望で煙幕と別ボタンに）。「見張り」は押している間ズームアウト。
    // 「識別」は常に薄く出し、味方機が識別を求めている間だけ青く点滅して残り秒を出す（押下＝識別信号。離しは見ない）。4 つとも丸の絵を SKILL_BUTTON_SCALE に縮め、文字は SKILL_FONT_PX
    for (const s of L.skills) {
      if (s.kind === 'smoke') this.smokeButton = new HoldButton(scene, s.x, s.y, s.label, { onUp: () => (input.smokeTap = true) }, TEXTURE_KEYS.roundButton, SKILL_BUTTON_SCALE, { fontPx: SKILL_FONT_PX });
      else if (s.kind === 'extinguish') this.extinguishButton = new HoldButton(scene, s.x, s.y, s.label, { onDown: () => (input.extinguishHeld = true), onUp: () => (input.extinguishHeld = false) }, TEXTURE_KEYS.roundButton, SKILL_BUTTON_SCALE, { fontPx: SKILL_FONT_PX });
      else if (s.kind === 'lookout') this.lookoutButton = new HoldButton(scene, s.x, s.y, s.label, { onDown: () => (input.lookout = true), onUp: () => (input.lookout = false) }, TEXTURE_KEYS.roundButton, SKILL_BUTTON_SCALE, { fontPx: SKILL_FONT_PX });
      else {
        this.identifyButton = new HoldButton(scene, s.x, s.y, s.label, { onDown: () => (input.identifyTap = true) }, TEXTURE_KEYS.roundButton, SKILL_BUTTON_SCALE, { fontPx: SKILL_FONT_PX });
        this.identifyButton.setEnabled(false);
      }
    }
  }

  /** 一時停止で押しかけを取り消す操作（PauseControl が止めるたびに集める。止めるときだけ確保する。並びは v0.6.7 と同じ） */
  controls(): (Cancelable | undefined)[] {
    return [this.torpedoButton, this.spreadButton, this.gunButton, this.smokeButton, this.extinguishButton, this.lookoutButton, this.identifyButton];
  }

  /** 魚雷ボタンを押している（長押しの途中） */
  get torpedoHeld(): boolean {
    return this.torpedoButton !== undefined && this.torpedoButton.pressed;
  }

  /** 兵装の上の 1 行の setText の回数（G8 のヘッドレスの数え） */
  get cueSetTextCount(): number {
    return this.cue.setTextCount;
  }

  /** 毎フレーム（hud-scene の update から。夜明けの帯の後）。nowMs は識別の点滅の位相と兵装の上の 1 行の出来事の秒（scene.time.now） */
  update(t: BoatTelemetry, nowMs: number): void {
    const a = t.arms;
    this.torpedoButton?.setRemaining(a.torpedoesAboard);
    this.torpedoButton?.setUsable(a.torpedoUsable);
    this.torpedoButton?.update();
    if (this.gunButton) {
      // 弾倉交換: 主兵装の 13mm・25mm（米PT の任務）か v0.6.8 の新しい道（艦・機。自分か借りた弾倉）の残り秒の大きい方。大発の任務は弾倉なしで 0 のまま
      const reloadN = Math.max(gunButtonReloadN(t), a.reloadN);
      if (reloadN !== this.lastReloadN) {
        this.lastReloadN = reloadN;
        this.gunButton.setLabel(gunButtonLabel(reloadN));
        this.gunButton.setEnabled(reloadN === 0); // 薄く（押したままでよい。交換が済めば撃ち続ける）
      }
      this.gunButton.setAlphaOverride(a.gunFiring ? GUN_FIRING_ALPHA : NaN); // どれかの砲が標的を持って撃っている間だけ濃く明るく（変わったときだけ書く。弾倉交換の間は撃っていないので薄いまま）
    }
    this.cue.update(a, nowMs, this.torpedoHeld);
    if (this.smokeButton) {
      // 展開中 / 冷却の残り秒 / 使える。整数が変わったときだけ文字が変わる
      this.smokeButton.setLabel(t.smokeLeftS > 0 ? '煙幕\n展開中' : t.smokeCooldownS > 0 ? `煙幕\n${Math.ceil(t.smokeCooldownS)}` : '煙幕');
      this.smokeButton.setEnabled(t.smokeLeftS <= 0 && t.smokeCooldownS <= 0);
    }
    // 消火は火災中だけ使える（押せるが Mission が無視する。薄く表示）。火災中は要する長押し秒を出す（乗員が減ると伸びる。v0.3.5）
    if (this.extinguishButton) {
      this.extinguishButton.setEnabled(t.onFire);
      const tenths = t.onFire ? Math.round(t.extinguishHoldS * 10) : 0;
      if (tenths !== this.lastHoldTenths) {
        this.lastHoldTenths = tenths;
        this.extinguishButton.setLabel(tenths > 0 ? `消火\n${(tenths / 10).toFixed(1)}s` : '消火');
      }
    }
    if (this.identifyButton) {
      // 識別を求めている間（航過中でも真上を過ぎてから押した後は除く）だけ有効。残り秒は 5,4,3,2,1 で 0 は出さない
      const live = t.friendlyPhase === FF_CHALLENGE || (t.friendlyPhase === FF_STRAFE && !t.friendlyPending);
      const n = t.friendlyPhase === FF_CHALLENGE ? Math.max(1, Math.ceil(t.friendlyLeftS)) : 0;
      if (n !== this.lastIdentifyN) {
        this.lastIdentifyN = n;
        this.identifyButton.setLabel(n > 0 ? `識別\n${n}` : '識別');
      }
      this.identifyButton.setEnabled(live);
      this.identifyButton.setTint(live ? HOME_COLOR : null);
      this.identifyButton.setAlphaOverride(
        live ? ROUND_BUTTON_ALPHA + (IDENTIFY_PULSE_ALPHA_MAX - ROUND_BUTTON_ALPHA) * (0.5 + 0.5 * Math.sin((2 * Math.PI * IDENTIFY_PULSE_HZ * nowMs) / 1000)) : NaN,
      );
    }
  }

  /** Hud の SHUTDOWN で 1 回（作ったボタンと 1 行だけ） */
  destroy(): void {
    this.torpedoButton?.destroy();
    this.gunButton?.destroy();
    this.smokeButton?.destroy();
    this.extinguishButton?.destroy();
    this.lookoutButton?.destroy();
    this.identifyButton?.destroy();
    this.spreadButton?.destroy();
    this.cue.destroy();
    this.torpedoButton = undefined;
    this.gunButton = undefined;
    this.smokeButton = undefined;
    this.extinguishButton = undefined;
    this.lookoutButton = undefined;
    this.identifyButton = undefined;
    this.spreadButton = undefined;
  }
}
