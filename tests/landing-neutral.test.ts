// 揚陸の仕組み（v0.6.9。jp_04）は他の任務で鍵ごと出ない（spec-v069 §9 の landing-neutral。engine・gunboat・patrolAir の optional part の作法）。
// S1: WorldSetup（ノーマル・ハード・史実モード・今夜の揺らぎ）に "landing" が無い。テレメトリ（landing.enabled）・2 行目の鍵（landingKey）・mode 35/36 は S5/S6 でこのファイルに足す。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup } from '../src/systems/world-setup';

type Rec = Record<string, unknown>;
const OTHERS = ['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_05', 'jp_06'] as const;

describe('landing-neutral（他の 7 任務）', () => {
  it('v0_1_prototype を持つのは 7 任務と jp_04 で、landing の block は jp_04 だけ', () => {
    const withProto = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);
    expect([...withProto].sort()).toEqual([...OTHERS, 'jp_04'].sort());
    const withLanding = (gameData.missionsSeed.missions as unknown as Rec[]).filter((m) => (m['v0_1_prototype'] as Rec | undefined)?.['landing'] !== undefined).map((m) => m['id']);
    expect(withLanding).toEqual(['jp_04']);
  });
  it.each(OTHERS)('%s: buildWorldSetup にノーマル・ハード・史実モード（揺らぎなし・seed 3 夜）とも "landing" が無い', (id) => {
    for (const hard of [false, true]) {
      for (const historical of [false, true]) {
        const builds = [buildWorldSetup(gameData, id, { hard, historical }), ...[1, 2, 3].map((seed) => buildWorldSetup(gameData, id, { hard, historical, sortie: directSortie(id, seed, 'none', hard, historical) }))];
        for (const s of builds) {
          expect('landing' in s, `${id} ${hard} ${historical}`).toBe(false);
          expect(JSON.stringify(s).includes('"landing"'), `${id} ${hard} ${historical}`).toBe(false);
        }
      }
    }
  });
  it('jp_04 だけが landing を持つ（ノーマル・ハード）', () => {
    for (const hard of [false, true]) expect('landing' in buildWorldSetup(gameData, 'jp_04', { hard })).toBe(true);
  });
});
