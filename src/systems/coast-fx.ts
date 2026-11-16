// v0.7.0 S3c（アートと音①：コードで描く絵。spec-v0700 §4.4・R16・R24）: 岸の帯（砂浜・寄せ波・陸の際の樹冠）。岸のある任務（us_03・jp_01・jp_02・jp_03・jp_04）の南の岸と、
// jp_03 の北の島（屋我地島）の岸の線に沿って、tex-coast-strip（512 m × 120 m・1.0 px/m。初めて使う時に 1 回）を並べる。波打ち際＝論理の縁（南は y＝海域の高さ、北は y 0）。
// 海の側は寄せ波の白だけ 8 m、砂浜と木々は陸の側 112 m（岸の名の字＝陸の中 200〜300 m・沿岸砲の砲台（深さ 9）にかからない）。
// S4: jp_03 も帯を切らずに岸の端から端まで通す（S3c は壕の絵 ± 150 m・陰の絵 ± 460 m をよけて、よけた所に何も無い暗緑の矩形が見えた）。壕の岩の絵・斜路の陸の部分は深さ 1.5（帯の上）、
// 陰の絵は陸の側を帯の上の深さに分けて置く（systems/evac-terrain）＝帯は岩・崖の下を通る。斜路の海の部分（深さ 1）には寄せ波の白が掛かる（波打ち際の波）。
// 1 本の岸の線は Blitter 1 つ（Bob は画面の物に数えない＝見える物 +1。並べ方は assets/coast-shape）。陸の内側は今の一様な塗り（entities/shallows・systems/evac-terrain）のまま。
// §7: 確保は constructor だけで、毎フレームは何もしない（動かない絵）。論理の状態は読むだけ。
// v0.8.0 S2（spec-v0800 §4.10・§7 の 9）: 岸の線の一覧（assets/coast-shape の coastLines）を受けて 1 本ずつ並べる。今の 2 本（南の岸・jp_03 の北の島）の値と順は v0.7.2 のまま、
// 海峡の両岸（us_04 の setup.shores）は北の岸 1 本・南の岸は水道の切れ目の両側の 2 本。
import type Phaser from 'phaser';
import { coastBobs, coastLines } from '../assets/coast-shape';
import { ensureCoastStripTexture } from '../assets/sea-art';
import type { EvacSetup } from '../config/evac-mission-data';
import { TEXTURE_KEYS } from '../config/game-config';
import type { CoastBlock } from '../config/mission-data';
import type { ShoresSetup } from '../config/shores-mission-data';
import { COAST_ART_PX_PER_M, COAST_STRIP_DEPTH, COAST_STRIP_LAND_M, COAST_STRIP_LEN_M, COAST_STRIP_SEA_M } from '../config/sea-art-config';

/** 世界から読む物（WorldSetup の一部） */
export interface CoastSetupView {
  readonly mission: { readonly coast: CoastBlock | null; readonly bounds: { readonly width: number; readonly height: number } };
  readonly evac?: EvacSetup;
  /** 海峡の両岸（v0.8.0 S2。us_04 だけ） */
  readonly shores?: ShoresSetup;
}

export class CoastFx {
  private readonly lines: Phaser.GameObjects.Blitter[] = [];

  constructor(scene: Phaser.Scene, s: CoastSetupView) {
    const lines = coastLines(s);
    if (lines.length === 0) return;
    ensureCoastStripTexture(scene);
    for (const l of lines) this.line(scene, l.y, l.x0, l.x1, l.flipY);
  }

  private line(scene: Phaser.Scene, y: number, x0: number, x1: number, flipY: boolean): void {
    const tex = scene.textures.get(TEXTURE_KEYS.coastStrip);
    const H = COAST_STRIP_SEA_M + COAST_STRIP_LAND_M;
    const bl = scene.add.blitter(0, y, TEXTURE_KEYS.coastStrip).setDepth(COAST_STRIP_DEPTH).setScale(1 / COAST_ART_PX_PER_M);
    for (const bob of coastBobs(x0, x1)) {
      const name = bob.w === COAST_STRIP_LEN_M ? `p${bob.row}` : `c${bob.row}-${bob.cut}`;
      if (!tex.has(name)) tex.add(name, 0, bob.cut, bob.row * H, bob.w, H);
      bl.create(bob.x, 0, name).setFlip(bob.flipX, flipY);
    }
    this.lines.push(bl);
  }

  destroy(): void {
    for (const b of this.lines) b.destroy();
    this.lines.length = 0;
  }
}
