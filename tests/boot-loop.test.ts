// Boot の輪（v0.6.7 S2。spec-v067 §C.7・レビュー R1）: scenes/boot-scene.ts:66-77 が v0_1_prototype を持つ全任務で回す組み立てと検査を Phaser なしで回し、
// どの任務でも投げない（投げると Pages が黒い画面になる。jp_02 の世界を足した S2 から、playable_from の前でも Boot はその任務を組む）。
// あわせて boot-scene の輪の並びをソースで pin する（輪に足した検査がこのテストにも入っているように）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import { getEngineParams } from '../src/config/engine-mission-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { getConvoyParams } from '../src/config/convoy-mission-data';
import { getGunboatParams } from '../src/config/gunboat-mission-data';
import { getPatrolAirParams } from '../src/config/patrol-air-mission-data';

type Rec = Record<string, unknown>;
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype'] && typeof m['id'] === 'string').map((m) => m['id'] as string);

/** boot-scene.ts:66-77 の輪の中身と同じ順（テクスチャの生成を除く） */
function bootLoop(id: string): void {
  getPrototypeMission(gameData, id);
  getEngineParams(gameData, id);
  getPatrolAirParams(gameData, id);
  const hm = hasHardVariant(gameData, id) ? getPrototypeMission(gameData, id, true) : null;
  if (hm) { getPtParams(gameData, hm, gameData.hitRateModel.world.time_scale); getConvoyParams(gameData, hm); }
  if (hm) getGunboatParams(gameData, hm);
}

describe('Boot の輪（v0_1_prototype を持つ全任務。spec-v067 §C.7）', () => {
  it('遊べる世界のある任務は 7 つ（v0.6.7 の S2 で jp_02。playable_from は S6）', () => {
    expect([...PROTO_IDS].sort()).toEqual(['jp_01', 'jp_02', 'jp_05', 'jp_06', 'us_01', 'us_02', 'us_03']);
  });
  it.each(PROTO_IDS)('%s: 組み立てと検査が投げない（ノーマル・ハード）', (id) => {
    expect(() => bootLoop(id)).not.toThrow();
  });
  it('jp_02（艦艇のいない航空機だけの任務）: ノーマル・ハードとも組めて、駆逐艦の出発点なし・敵は飛行艇 2 機・撃たない', () => {
    for (const hard of [false, true]) {
      const m = getPrototypeMission(gameData, 'jp_02', hard);
      expect([m.enemyStart, m.enemyStarts.length, m.enemyCount, m.mainWeapon, m.barges, m.ptBoats, m.hard]).toEqual([null, 0, 2, 'none', null, null, hard]);
    }
    expect(hasHardVariant(gameData, 'jp_02')).toBe(false);
  });
  it('ソースの pin: boot-scene の輪は getPrototypeMission → getEngineParams → getPatrolAirParams → ハード（getPtParams・getConvoyParams）→ getGunboatParams の順', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'scenes', 'boot-scene.ts'), 'utf8');
    const start = src.indexOf('for (const m of gameData.missionsSeed.missions');
    const end = src.indexOf('for (const id of boatIds)');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const loop = src.slice(start, end);
    const calls = ["getPrototypeMission(gameData, m['id'])", "getEngineParams(gameData, m['id'])", "getPatrolAirParams(gameData, m['id'])", "getPrototypeMission(gameData, m['id'], true)", 'getPtParams(gameData, hm,', 'getConvoyParams(gameData, hm)', 'getGunboatParams(gameData, hm)'];
    let at = -1;
    for (const c of calls) {
      const i = loop.indexOf(c);
      expect(i, c).toBeGreaterThan(at);
      at = i;
    }
  });
});
