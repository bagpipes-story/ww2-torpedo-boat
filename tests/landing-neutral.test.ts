// 揚陸の仕組み（v0.6.9。jp_04）は他の任務で鍵ごと出ない（spec-v069 §9 の landing-neutral。engine・gunboat・patrolAir の optional part の作法）。
// S1: WorldSetup（ノーマル・ハード・史実モード・今夜の揺らぎ）に "landing" が無い。S5b: テレメトリの landing は鍵がいつもあり enabled false（世界の揚陸は null＝buildLanding の
// 最初の枝。tests/landing-step-order）、既存のテレメトリの組（tests/pt-ui-kit・dawn-lines・dawn-clock）の 2 行目のモードは 35・36・37 にならない。2 行目の鍵（landingKey が 0）は S6a で足す。
// R14（S6a-fix）: 輪の中の待ち（A5）・輸送船が射線に入る（A1）も揚陸の任務だけ。終わり方（systems/mission-end の landingHold）は landing の無い世界で偽＝decideMissionEnd のまま。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { createLandingTelemetry } from '../src/core/landing';
import { createPtSection } from '../src/core/pt-boats';
import { directSortie } from '../src/core/sortie';
import { initLandingTelemetry, refreshLandingTelemetry } from '../src/systems/landing-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { landingHold, MissionEnd, type MissionEndWorld } from '../src/systems/mission-end';
import { missionMode } from '../src/ui/mission-mode';
import { tele } from './pt-ui-kit';

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

/** コメントを除いたソース */
const code = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('landing-neutral のテレメトリ（S5b。他の 7 任務）', () => {
  it('配線: 揚陸の世界は setup.landing の無い任務で null（buildLanding の最初の枝）、出発時のテレメトリはいつも landing の鍵を持ち、毎フレームの書き換えは null の世界で何もしない', () => {
    expect(code('systems/world-landing.ts')).toContain('if (!s.landing || !pts) return null;');
    expect(code('systems/telemetry-create.ts')).toContain('landing: initLandingTelemetry(w),');
    expect(code('systems/mission-telemetry.ts')).toContain('refreshLandingTelemetry(t.landing, w);');
    const r = code('systems/landing-telemetry.ts');
    expect(r).toContain('if (!ld || !w.pts) return t;');
    expect(r).toContain('if (!ld || !s) return;');
  });
  it.each(OTHERS)('%s: ノーマル・ハード・史実モード（seed 3 夜）とも landing.enabled false、中身は createLandingTelemetry のまま（毎フレーム書いても変わらない）', (id) => {
    for (const hard of [false, true]) {
      for (const historical of [false, true]) {
        for (const seed of [1, 2, 3]) {
          const s = buildWorldSetup(gameData, id, { hard, historical, sortie: directSortie(id, seed, 'none', hard, historical) });
          expect('landing' in s).toBe(false);
          // MissionWorld と同じ形: 揚陸の世界は null（setup.landing が無い）、米PT の隊は任務にあれば本物
          const w = { landing: null, pts: s.ptBoats ? { section: createPtSection(s.ptBoats, PT_SHELL_POOL_SIZE) } : null, boat: { state: { ...s.playerStart, speedMps: 0 } }, stepTimeS: 50, visRange2: s.visRange2 };
          const t = initLandingTelemetry(w);
          expect(t.enabled, `${id} ${hard} ${historical} ${seed}`).toBe(false);
          refreshLandingTelemetry(t, w);
          expect(t).toEqual(createLandingTelemetry());
        }
      }
    }
  });
  it('既存のテレメトリの組（landing.enabled false）の 2 行目のモードは 35（揚陸の出来事）・36（揚陸の脅威）・37（輸送船が射線に入る）にならない（米PT の段階・接触・航過・呼びかけ・出来事の旗・輪の中の全組み合わせ）', () => {
    const modes = new Set<number>();
    for (const detected of [false, true]) {
      for (const passing of [false, true]) {
        for (const alive of [0, 2]) {
          for (let threatPhase = -1; threatPhase <= 8; threatPhase++) {
            for (const atHome of [false, true]) {
              const t = tele({ detected, passing, alive, threatPhase }, { atHome, landing: { ...createLandingTelemetry(), fireLineI: 0 } });
              expect(t.landing.enabled).toBe(false);
              for (let call = 0; call <= 8; call++) for (let flags = 0; flags < 256; flags++) modes.add(missionMode(t, call, flags));
            }
          }
        }
      }
    }
    expect(modes.size).toBeGreaterThan(3);
    for (const m of [35, 36, 37]) expect(modes.has(m), String(m)).toBe(false);
  });
  it('終わり方（R14 A5）: landing の無い世界（null・無し）は輪の中でいつもどおり帰投（landingHold は偽）', () => {
    const rp = buildWorldSetup(gameData, 'jp_05').mission.returnPoint;
    const base: MissionEndWorld = { boat: { sinking: false }, atHome: true, grounded: false, torpedoesRunning: false, torpedoes: { unresolvedCount: 0 }, enemy: { sinkPlaying: false, allOut: false }, fuel: { empty: false }, band: 'stop', stepTimeS: 10 };
    for (const w of [base, { ...base, landing: null }]) {
      expect(landingHold(w)).toBe(false);
      expect(new MissionEnd(rp, 1.5, false).step(w, 0, 60)).toBe('returned');
    }
  });
});
