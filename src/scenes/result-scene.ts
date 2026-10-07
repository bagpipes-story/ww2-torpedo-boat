// Result: 命中数・距離帯別の命中・駆逐艦の状態・生還を表示し、タップで Mission を再開する（docs/02 §4）。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENE_KEYS } from '../config/game-config';
import {
  HUD_COLOR_STRONG,
  HUD_FONT_HEADING_PX,
  HUD_FONT_SPEED_PX,
  HUD_FONT_STEP_PX,
  RESULT_FOOTER_Y,
  RESULT_INPUT_DELAY_MS,
  RESULT_LINE_GAP,
  RESULT_SECTION_GAP,
  RESULT_SEED_Y,
  RESULT_TOP_Y,
  hudTextStyle,
} from '../config/ui-config';
import type { BandSummary, ShotRecord } from '../core/hit-rate';

export type MissionEndReason = 'sunk' | 'expended' | 'timeout' | 'rammed';

export interface MissionResult {
  reason: MissionEndReason;
  shots: ShotRecord[];
  bands: BandSummary[];
  hits: number;
  duds: number;
  misses: number;
  capacity: number;
  destroyerSunk: boolean;
  survived: boolean;
  elapsedS: number;
  seed: number;
}

const REASON_LABEL: Record<MissionEndReason, string> = {
  sunk: '駆逐艦を撃沈',
  expended: '魚雷を撃ち尽くした',
  timeout: '時間切れ',
  rammed: '駆逐艦に体当たりされた',
};

export class ResultScene extends Phaser.Scene {
  private result?: MissionResult;

  constructor() {
    super(SCENE_KEYS.result);
  }

  init(data: MissionResult): void {
    this.result = data;
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    const r = this.result;
    if (!r) {
      this.scene.start(SCENE_KEYS.mission);
      return;
    }
    const cx = GAME_WIDTH / 2;
    let y = RESULT_TOP_Y;
    const line = (text: string, size: number, color?: string): void => {
      this.add.text(cx, y, text, hudTextStyle(size, color)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
      y += size + RESULT_LINE_GAP;
    };
    line(`任務終了 — ${REASON_LABEL[r.reason]}`, HUD_FONT_SPEED_PX, HUD_COLOR_STRONG);
    const fired = r.shots.length;
    const unfired = r.capacity - fired;
    line(`命中 ${r.hits} / 発射 ${fired}（不発 ${r.duds}、外れ ${r.misses}${unfired > 0 ? `、未発射 ${unfired}` : ''}）`, HUD_FONT_STEP_PX, HUD_COLOR_STRONG);
    y += RESULT_SECTION_GAP;
    const bandsFired = r.bands.filter((b) => b.shots > 0);
    if (bandsFired.length === 0) {
      line('発射なし', HUD_FONT_HEADING_PX);
    } else {
      for (const b of bandsFired) {
        line(`${b.band}: ${b.hits} / ${b.shots}${b.duds > 0 ? `（不発 ${b.duds}）` : ''}`, HUD_FONT_HEADING_PX);
      }
    }
    y += RESULT_SECTION_GAP;
    line(`駆逐艦: ${r.destroyerSunk ? '撃沈' : '健在'}   生還: ${r.survived ? 'あり' : 'なし'}   ${Math.round(r.elapsedS)} 秒`, HUD_FONT_HEADING_PX);
    this.add
      .text(cx, GAME_HEIGHT - RESULT_FOOTER_Y, 'タップでもう一度', hudTextStyle(HUD_FONT_STEP_PX, HUD_COLOR_STRONG))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud);
    this.add
      .text(cx, GAME_HEIGHT - RESULT_SEED_Y, `seed ${r.seed}`, hudTextStyle(HUD_FONT_HEADING_PX))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud);

    // 任務中から押しっぱなしの指（スティック）の離しでは再開しない: 少し待ってから、新しく押された指の離しだけを受け付ける
    this.time.delayedCall(RESULT_INPUT_DELAY_MS, () => {
      this.input.once(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
        const id = p.id;
        const onUp = (q: Phaser.Input.Pointer): void => {
          if (q.id !== id) return;
          this.input.off(Phaser.Input.Events.POINTER_UP, onUp);
          this.scene.start(SCENE_KEYS.mission);
        };
        this.input.on(Phaser.Input.Events.POINTER_UP, onUp);
      });
    });
  }
}
