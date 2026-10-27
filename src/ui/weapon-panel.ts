// HUD の右側のボタン（魚雷・扇・射撃・煙幕・消火・見張り・識別）の作成・毎フレームの更新・後始末（v0.6.8 S0 で scenes/hud-scene から切り出し。中身はそのまま）。
// 作る順と update の順は hud-scene にあったときと同じ（同じ depth の重なりを変えない）: hud-scene はスティックの後・キーボードの前に作り、update では夜明けの帯の後に呼ぶ。
// 値が変わったときだけ文字を組む（§7。前回の値はこのクラスが持つ。Hud を作り直すたびにこのクラスも作り直すので前回の値を引きずらない）。
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, TEXTURE_KEYS } from '../config/game-config';
import { getBoatSmokeParams, type GameData } from '../config/game-data';
import { GUN_BUTTON_LABEL } from '../config/hunt-config';
import type { PrototypeMission } from '../config/mission-data';
import {
  HOME_COLOR,
  IDENTIFY_BUTTON_Y,
  LOOKOUT_BUTTON_Y,
  SPREAD_BUTTON_Y,
  IDENTIFY_PULSE_ALPHA_MAX,
  IDENTIFY_PULSE_HZ,
  ROUND_BUTTON_ALPHA,
  TORPEDO_BUTTON_ARM_MS,
  TORPEDO_BUTTON_RADIUS,
  ROUND_BUTTON_GAP,
  ROUND_BUTTON_RADIUS,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { FF_CHALLENGE, FF_STRAFE } from '../core/friendly';
import type { InputState } from '../core/input-state';
import type { SpreadConfig } from '../core/salvo';
import { HoldButton } from '../systems/hold-button';
import type { Cancelable } from '../systems/pause-control';
import { SpreadButton } from '../systems/spread-button';
import { TorpedoButton } from '../systems/torpedo-button';
import { gunButtonLabel, gunButtonReloadN } from './pt-gun-lines';

export class WeaponPanel {
  private torpedoButton?: TorpedoButton;
  /** 扇の角度（v0.5.1 実機 1 回目）。魚雷ボタンの下。魚雷の任務だけ */
  private spreadButton?: SpreadButton;
  /** 「射撃」（主兵装が砲の任務。v0.4.2）: 右下の魚雷ボタンの場所。押している間 gunHeld。出だしの 0.6 秒は受けない（「出撃」の 2 度押し） */
  private gunButton?: HoldButton;
  private smokeButton?: HoldButton;
  private extinguishButton?: HoldButton;
  private lookoutButton?: HoldButton;
  /** 「識別」（v0.3.3）。任務に味方機がいるときだけ作る。残り秒の整数が変わったときだけ文字を組む */
  private identifyButton?: HoldButton;
  private lastIdentifyN = -1;
  private lastHoldTenths = -1;
  private lastReloadN = 0; // 射撃ボタンの弾倉交換の残り秒（0 は交換中でない。v0.6.3 実機 1 回目のレビュー ux-2: 赤い線の下で弾が止まる訳が見えなかった）

  constructor(scene: Phaser.Scene, input: InputState, data: GameData, mission: PrototypeMission, telemetry: BoatTelemetry, spread: SpreadConfig) {
    const launch = data.hitRateModel.torpedo_launch;
    if (mission.mainWeapon === 'guns') {
      let armed = false;
      scene.time.delayedCall(TORPEDO_BUTTON_ARM_MS, () => (armed = true));
      const gx = GAME_WIDTH - HUD_MARGIN - TORPEDO_BUTTON_RADIUS;
      const gy = GAME_HEIGHT - HUD_MARGIN - TORPEDO_BUTTON_RADIUS;
      this.gunButton = new HoldButton(scene, gx, gy, GUN_BUTTON_LABEL, { onDown: () => (input.gunHeld = armed), onUp: () => (input.gunHeld = false) }, TEXTURE_KEYS.torpedoButton);
    } else if (mission.mainWeapon === 'torpedo') { // 主兵装 none（撃たない米PT の任務。v0.6.3 の最初の jp_05。実機 1 回目から jp_05 は guns）は魚雷・扇・射撃のボタンを作らない（発射の入力は世界が捨てる）
      this.torpedoButton = new TorpedoButton(scene, input, spread);
      this.torpedoButton.setRemaining(telemetry.torpedoesLeft);
      this.spreadButton = new SpreadButton(scene, GAME_WIDTH - HUD_MARGIN - TORPEDO_BUTTON_RADIUS, SPREAD_BUTTON_Y, spread, launch.salvo_spacing_deg, launch.salvo_spacing_choices_deg);
    }
    // 右上「煙幕」: 離すと展開。その下「消火」: 火災中に押し続けると消火（押している時間は Mission が数える。v0.3.1 実機の要望で煙幕と別ボタンに）。右中「見張り」: 押している間ズームアウト
    const bx = GAME_WIDTH - HUD_MARGIN - ROUND_BUTTON_RADIUS;
    // 煙幕発生器の無い艇（日本の魚雷艇。v0.6.0）は煙幕ボタンを作らない（消火・見張りの位置は変えない）
    if (getBoatSmokeParams(data, mission.playerBoatId) !== null) {
      this.smokeButton = new HoldButton(scene, bx, HUD_MARGIN + ROUND_BUTTON_RADIUS, '煙幕', {
        onUp: () => {
          input.smokeTap = true;
        },
      });
    }
    this.extinguishButton = new HoldButton(scene, bx, HUD_MARGIN + ROUND_BUTTON_RADIUS * 3 + ROUND_BUTTON_GAP, '消火', {
      onDown: () => {
        input.extinguishHeld = true;
      },
      onUp: () => {
        input.extinguishHeld = false;
      },
    });
    this.lookoutButton = new HoldButton(scene, bx, LOOKOUT_BUTTON_Y, '見張り', {
      onDown: () => {
        input.lookout = true;
      },
      onUp: () => {
        input.lookout = false;
      },
    });
    // 「識別」: 見張りと魚雷の間。常に薄く出し、味方機が識別を求めている間だけ青く点滅して残り秒を出す（押下＝識別信号。離しは見ない）
    // 今夜味方機がいるときだけ（v0.4.6。夜の揺らぎで来ない夜がある）
    if (telemetry.friendlyEnabled) {
      this.identifyButton = new HoldButton(scene, bx, IDENTIFY_BUTTON_Y, '識別', {
        onDown: () => {
          input.identifyTap = true;
        },
      });
      this.identifyButton.setEnabled(false);
    }
  }

  /** 一時停止で押しかけを取り消す操作（PauseControl が止めるたびに集める。止めるときだけ確保する） */
  controls(): (Cancelable | undefined)[] {
    return [this.torpedoButton, this.spreadButton, this.gunButton, this.smokeButton, this.extinguishButton, this.lookoutButton, this.identifyButton];
  }

  /** 毎フレーム（hud-scene の update から。夜明けの帯の後）。nowMs は識別の点滅の位相（scene.time.now） */
  update(t: BoatTelemetry, nowMs: number): void {
    this.torpedoButton?.setRemaining(t.torpedoesLeft);
    this.torpedoButton?.update();
    const reloadN = this.gunButton ? gunButtonReloadN(t) : 0; // 米PT の任務の 13mm だけ（大発の任務は弾倉なしで 0 のまま）
    if (reloadN !== this.lastReloadN) {
      this.lastReloadN = reloadN;
      this.gunButton?.setLabel(gunButtonLabel(reloadN));
      this.gunButton?.setEnabled(reloadN === 0); // 薄く（押したままでよい。交換が済めば撃ち続ける）
    }
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

  /** Hud の SHUTDOWN で 1 回（作ったボタンだけ） */
  destroy(): void {
    this.torpedoButton?.destroy();
    this.gunButton?.destroy();
    this.smokeButton?.destroy();
    this.extinguishButton?.destroy();
    this.lookoutButton?.destroy();
    this.identifyButton?.destroy();
    this.spreadButton?.destroy();
    this.torpedoButton = undefined;
    this.gunButton = undefined;
    this.smokeButton = undefined;
    this.extinguishButton = undefined;
    this.lookoutButton = undefined;
    this.identifyButton = undefined;
    this.spreadButton = undefined;
  }
}
