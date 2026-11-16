// v0.8.0 S2（spec-v0800 §4.3・§4.10・§5.2・§7 の 9、brief L15）: 海峡の両岸の絵。
// - 岸の帯（assets/coast-shape の coastLines → systems/coast-fx）: 今の岸の任務（南の岸・jp_03 の北の島）の帯の線は v0.7.2 の coast-fx の式・順のまま（Bob も同じ）、
//   岸の無い任務は空。us_04 は北の岸 1 本・南の岸は水道の切れ目の両側の 2 本（切れ目に帯なし）。
// - 陸と字（systems/strait-terrain）: 起動時に 1 回の Graphics（命令は us_04 で 10）と字 5（島 3・水道 1・揚陸の地 1）。毎フレームは何もしない。world-art が両岸の任務だけ作る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coastBobs, coastLines, shoreLandSpans, type CoastLine } from '../src/assets/coast-shape';
import { EVAC_ISLAND_LAND_M } from '../src/config/evac-config';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { COAST_STRIP_LAND_M, COAST_STRIP_SEA_M } from '../src/config/sea-art-config';
import { buildWorldSetup } from '../src/systems/world-setup';

const code = (p: string): string => readFileSync(`src/${p}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const protoIds = (gameData.missionsSeed.missions as unknown as { id: string; v0_1_prototype?: unknown }[]).filter((m) => m.v0_1_prototype).map((m) => m.id);

/** v0.7.2 の systems/coast-fx の constructor の式（今の岸の 2 本） */
function v072Lines(s: ReturnType<typeof buildWorldSetup>): CoastLine[] {
  const coast = s.mission.coast;
  if (!coast) return [];
  const { width, height } = s.mission.bounds;
  const out: CoastLine[] = [{ y: height - COAST_STRIP_SEA_M, x0: -coast.landM, x1: width + coast.landM, flipY: false }];
  if (s.evac) out.push({ y: -COAST_STRIP_LAND_M, x0: -EVAC_ISLAND_LAND_M, x1: width + EVAC_ISLAND_LAND_M, flipY: true });
  return out;
}

describe('岸の帯の線（coastLines）', () => {
  it('両岸の無い任務（ハードも）は v0.7.2 の式・順と同じ線（Bob も同じ）。岸の無い任務は空', () => {
    let withCoast = 0;
    for (const id of protoIds) {
      for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) {
        const s = buildWorldSetup(gameData, id, { hard });
        if (s.shores) continue;
        const got = coastLines(s);
        expect(got, id).toEqual(v072Lines(s));
        for (let i = 0; i < got.length; i++) expect(coastBobs(got[i]!.x0, got[i]!.x1)).toEqual(coastBobs(v072Lines(s)[i]!.x0, v072Lines(s)[i]!.x1));
        if (got.length > 0) withCoast++;
      }
    }
    expect(withCoast).toBeGreaterThanOrEqual(5); // us_03・jp_01・jp_02・jp_03・jp_04（とハード）
  });
  it('us_04: 北の岸 1 本（−600〜6,600・上下反転）・南の岸 2 本（−600〜700 と 1,900〜6,600）。水道（700〜1,900）に帯なし。帯は区間を隙間なく覆う', () => {
    const s = buildWorldSetup(gameData, 'us_04', {});
    const H = s.mission.bounds.height;
    expect(coastLines(s)).toEqual([
      { y: -COAST_STRIP_LAND_M, x0: -600, x1: 6600, flipY: true },
      { y: H - COAST_STRIP_SEA_M, x0: -600, x1: 700, flipY: false },
      { y: H - COAST_STRIP_SEA_M, x0: 1900, x1: 6600, flipY: false },
    ]);
    for (const l of coastLines(s)) {
      const bobs = coastBobs(l.x0, l.x1);
      expect(bobs[0]!.x).toBe(l.x0);
      expect(bobs.reduce((a, b) => a + b.w, 0)).toBe(l.x1 - l.x0);
      for (let i = 1; i < bobs.length; i++) expect(bobs[i]!.x).toBe(bobs[i - 1]!.x + bobs[i - 1]!.w);
    }
    expect(buildWorldSetup(gameData, 'us_04', { hard: true }).shores).toEqual(s.shores);
  });
  it('陸の区間: 切れ目を除き、海域の幅の外へ陸の幅だけ伸ばす（切れ目が端なら端の外の陸は残す）', () => {
    expect(shoreLandSpans({ landM: 600, gaps: [] }, 6000)).toEqual([{ x0: -600, x1: 6600 }]);
    expect(shoreLandSpans({ landM: 600, gaps: [{ x0: 700, x1: 1900 }] }, 6000)).toEqual([{ x0: -600, x1: 700 }, { x0: 1900, x1: 6600 }]);
    expect(shoreLandSpans({ landM: 100, gaps: [{ x0: 0, x1: 50 }, { x0: 900, x1: 1000 }] }, 1000)).toEqual([{ x0: -100, x1: 0 }, { x0: 50, x1: 900 }, { x0: 1000, x1: 1100 }]);
  });
  it('coast-fx は線の一覧を受けて 1 本ずつ並べるだけ（今の 2 本の式は coast-shape に移した）', () => {
    const s = code('systems/coast-fx.ts');
    expect(s).toContain('const lines = coastLines(s);');
    expect(s).toContain('for (const l of lines) this.line(scene, l.y, l.x0, l.x1, l.flipY);');
    expect(s).not.toContain('EVAC_ISLAND_LAND_M');
  });
});

describe('陸と字（systems/strait-terrain）', () => {
  const s = code('systems/strait-terrain.ts');
  it('起動時の 1 回だけ: Graphics 1・塗りの色 1・線の色 1・陸の矩形と浜の線は陸の区間ごと・水道に面した陸の端の線は切れ目ごとに 2 本。毎フレームの口・描き直し・テクスチャ化は無い', () => {
    expect(s.split('scene.add.graphics()').length - 1).toBe(1);
    expect(s.split('g.fillStyle(').length - 1).toBe(1);
    expect(s.split('g.lineStyle(').length - 1).toBe(1);
    expect(s.split('.fillRect(').length - 1).toBe(2);
    expect(s.split('.lineBetween(').length - 1).toBe(3);
    expect(s).not.toMatch(/\bupdate\w*\(|\.clear\(\)|generateTexture|tweens/);
    // us_04 の数: 陸の区間 3（北 1・南 2）→ 矩形 3・浜の線 3、切れ目 1 → 端の線 2 ＝ 命令 1 + 3 + 1 + 3 + 2 ＝ 10
    const sh = buildWorldSetup(gameData, 'us_04', {}).shores!;
    const spans = shoreLandSpans(sh.north, 6000).length + shoreLandSpans(sh.south, 6000).length;
    const gaps = sh.north.gaps.length + sh.south.gaps.length;
    expect([spans, gaps, 1 + spans + 1 + spans + 2 * gaps]).toEqual([3, 1, 10]);
  });
  it('字は島の名・切れ目の名・揚陸の地の名と矢印（us_04 は 5。どれも data の shores・transit から）。字の Text は label の 1 か所だけで作る', () => {
    expect(s.split('scene.add.text(').length - 1).toBe(1);
    const u = buildWorldSetup(gameData, 'us_04', {});
    const sh = u.shores!;
    const n = sh.north.labels.length + sh.south.labels.length + sh.north.gaps.length + sh.south.gaps.length + (u.transit ? 1 : 0);
    expect(n).toBe(5);
    expect([...sh.north.labels, ...sh.south.labels].map((l) => l.labelJa)).toEqual(['コロンバンガラ島', 'ギゾ島', 'アランデル島']);
    expect([sh.south.gapLabelJa, u.transit!.vilaLabelJa, u.transit!.inbound.edge]).toEqual(['ファーガソン水道', 'ビラ', 'west']);
    expect(s).toContain("const text = east ? `${tr.vilaLabelJa} ${STRAIT_LANDING_ARROW_EAST_JA}` : `${STRAIT_LANDING_ARROW_WEST_JA} ${tr.vilaLabelJa}`;");
  });
  it('world-art: 両岸の任務だけ作り（岸の帯の後）、破棄する', () => {
    const w = code('systems/world-art.ts');
    expect(w).toContain('this.strait = w.setup.shores ? new StraitTerrain(scene, w.setup) : null;');
    expect(w.indexOf('this.coast = new CoastFx(scene, w.setup);')).toBeLessThan(w.indexOf('this.strait = '));
    expect(w).toContain('this.strait?.destroy();');
  });
});
