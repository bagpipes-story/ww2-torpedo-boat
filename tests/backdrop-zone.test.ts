// v0.8.1 IP1（実機 1 回目のユーザー「暗い岸という視覚的表現がマップになく…」、lead の I1・I2・I5・I6）: 岸の陰の海（core/backdrop-zone）と、その絵（systems/backdrop-fx・assets/backdrop-art）の作法。
// - 升の中心では本当の判定（core/strait-geometry の landBehind＝systems/shore-backdrop のビット）と 1 つも違わない。ばらまいた点は、違えば本当の判定がその点の升か隣の升の中心で変わる（境の升の内）。
// - us_06 の本当の data（今夜の揺らぎ込みの卯月・空知丸・ハードの駆潜艇の出発点）で、卯月の真南の浜は陰・北の海は陰の外・陰は艦より陸の側だけ・テクスチャは横 750 px 以下。
// - 岸の線の無い任務・陸の区間の無い線は空（絵を作らない）。背に岸の無い任務（us_02・us_04 ほか）は world-art が BackdropFx を作らない（setup.backdrop が無い）。
// - 世界は絵を読まない（core/backdrop-zone を import するのは systems/backdrop-fx だけ・backdrop-fx は world-art だけ）。音の層も読まない（tests/sfx-rules）。
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gameData } from '../src/config/game-data';
import { BACKDROP_ZONE_GRID_M } from '../src/config/backdrop-art-config';
import { backdropZone, zoneContains, type BackdropZone } from '../src/core/backdrop-zone';
import { SeededRng } from '../src/core/rng';
import { landBehind, landLine, landLinesOf, type LandLine } from '../src/core/strait-geometry';
import { buildWorldSetup } from '../src/systems/world-setup';

const us06 = buildWorldSetup(gameData, 'us_06', {});
const hard = buildWorldSetup(gameData, 'us_06', { hard: true });
const { width: W, height: H } = us06.mission.bounds;
const COAST: LandLine[] = landLinesOf(null, true, W, H);
const X2 = us06.backdrop!.behindM2;

/** 隊の止まった艦の今夜の出発点（駆逐艦 → 輸送船 → ハードの駆潜艇） */
function anchoredStarts(s: typeof us06): { x: number; y: number }[] {
  return [...s.destroyer!.starts, ...(s.transport ? [s.transport.start] : []), ...(s.pickets ? s.pickets.starts : [])];
}

function cellCenterAgree(z: BackdropZone, sx: number, sy: number): number {
  let bad = 0;
  for (let r = 0; r < z.rows; r++) for (let c = 0; c < z.cols; c++) {
    const x = z.x0 + (c + 0.5) * z.stepM;
    const y = z.y0 + (r + 0.5) * z.stepM;
    if (landBehind(COAST, sx, sy, x, y, X2) !== zoneContains(z, x, y)) bad++;
  }
  return bad;
}

describe('岸の陰の海は本当の判定（landBehind）と合う（I1・I6）', () => {
  it.each([['ノーマル', us06], ['ハード', hard]] as const)('%s の止まった艦の全部: 升の中心で 1 つも違わない・ばらまいた点の違いは境の升の内だけ', (_, s) => {
    const starts = anchoredStarts(s);
    expect(starts.length).toBe(s === hard ? 4 : 2);
    const rng = new SeededRng(81);
    for (const p of starts) {
      const z = backdropZone(COAST, p.x, p.y, X2, W, H, BACKDROP_ZONE_GRID_M);
      expect(z.count).toBeGreaterThan(0);
      expect(cellCenterAgree(z, p.x, p.y)).toBe(0);
      let off = 0;
      for (let k = 0; k < 4000; k++) {
        const x = rng.next() * W;
        const y = p.y + rng.next() * (H - p.y);
        const truth = landBehind(COAST, p.x, p.y, x, y, X2);
        if (truth === zoneContains(z, x, y)) continue;
        off++;
        // 違う点は境の近く: その点の升か隣の升の中心で本当の判定が変わる（境が升 1 つの内を通る。岸の線と海域の端の角の細い楔も）
        const c = Math.floor((x - z.x0) / z.stepM), r = Math.floor((y - z.y0) / z.stepM);
        let near = false;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) near ||= landBehind(COAST, p.x, p.y, z.x0 + (c + j + 0.5) * z.stepM, z.y0 + (r + i + 0.5) * z.stepM, X2) !== truth;
        expect(near, `${p.x},${p.y} ${x},${y} ${truth} c${c} r${r}`).toBe(true);
      }
      expect(off / 4000).toBeLessThan(0.02);
    }
  });
  it('卯月（今夜の位置）: 真南の浜は陰・北の海と艦より北は陰の外・升の外は偽・行は艦の y から岸の線まで・テクスチャは横 750 px 以下', () => {
    const u = us06.destroyer!.starts[0]!;
    const z = backdropZone(COAST, u.x, u.y, X2, W, H, BACKDROP_ZONE_GRID_M);
    expect(zoneContains(z, u.x, H - 100)).toBe(true);
    expect(zoneContains(z, u.x, 1500)).toBe(false);
    expect(zoneContains(z, u.x, u.y - 10)).toBe(false);
    expect(zoneContains(z, -10, H - 10)).toBe(false);
    expect(zoneContains(z, W + 10, H - 10)).toBe(false);
    expect(z.y0).toBe(u.y);
    expect(z.rows).toBe(Math.ceil((H - u.y) / BACKDROP_ZONE_GRID_M));
    expect(z.cols).toBe(Math.ceil(W / BACKDROP_ZONE_GRID_M));
    expect(z.cols).toBeLessThanOrEqual(750);
  });
  it('岸の線が無い・陸の区間の無い線は空（絵を作らない）', () => {
    expect(backdropZone([], 3000, 1500, X2, W, H, 8)).toMatchObject({ rows: 0, cols: 0, count: 0 });
    expect(backdropZone([landLine('south', W, H, [{ x0: 0, x1: W }])], 3000, 1500, X2, W, H, 8).count).toBe(0);
  });
});

describe('作法（I2・I5）: 背に岸の任務だけ・世界は絵を読まない・毎フレーム描かない', () => {
  const code = (f: string): string => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  it('背に岸のある任務は us_06（ノーマル・ハード）だけ＝ほかの任務は world-art が BackdropFx を作らない', () => {
    const ids = (gameData.missionsSeed.missions as { id: string; v0_1_prototype?: unknown }[]).filter((m) => m.v0_1_prototype).map((m) => m.id);
    expect(ids.filter((id) => buildWorldSetup(gameData, id, {}).backdrop !== undefined)).toEqual(['us_06']);
    expect(buildWorldSetup(gameData, 'us_06', { backdropOff: true }).backdrop).toBeUndefined();
    expect(code('src/systems/world-art.ts')).toContain('this.backdrop = w.setup.backdrop && w.destroyers?.backdrop ? new BackdropFx(scene, w) : null;');
  });
  it('core/backdrop-zone を import するのは systems/backdrop-fx だけ・backdrop-fx は world-art だけ（世界・HUD・音は読まない）', () => {
    const files: string[] = [];
    for (const d of ['src/core', 'src/systems', 'src/ui', 'src/scenes', 'src/entities', 'src/assets', 'src/config']) for (const f of readdirSync(d)) if (f.endsWith('.ts')) files.push(join(d, f));
    const by = (re: RegExp): string[] => files.filter((f) => re.test(readFileSync(f, 'utf8'))).sort();
    expect(by(/from '[./]*(core\/)?backdrop-zone'/)).toEqual(['src/assets/backdrop-art.ts', 'src/systems/backdrop-fx.ts']);
    expect(by(/from '\.\/backdrop-fx'|systems\/backdrop-fx'/)).toEqual(['src/systems/world-art.ts']);
    expect(by(/backdrop-art'/)).toEqual(['src/systems/backdrop-fx.ts']);
  });
  it('backdrop-fx の毎フレームは見せる艦が替わった時と薄れの間だけ α を書く（描き直さない・確保しない）', () => {
    const s = code('src/systems/backdrop-fx.ts');
    expect(s).toContain('if (!this.fading) return;');
    expect(s).not.toMatch(/generateTexture|\.clear\(\)|fillPoints/);
    const upd = s.slice(s.indexOf('  update(realDt'), s.indexOf('  destroy()'));
    expect(upd).not.toMatch(/\bnew\s|\.map\(|\.filter\(|backdropZone\(|paintBackdrop/);
  });
});
