// v0.8.2 S2（spec-v0820 §4.5 D-N1〜D-N6・§8 の S2「recon-world」、lead の L22・L26）: 報告・無線・中継の世界の配線（systems/world-recon・world-enemies の無線の手・mission-objective・
// mission-world の returnCallDone・world-enemy-step の順）を、Phaser なしの小さな世界（艦は位置と out だけの素の物・レーダーは接触の数だけ）と、本物の world-enemies（絵は偽の場面）で確かめる:
// - 確かめる: 戦艦（山城・扶桑）が視程の 2 乗の内に入ったステップに TRACKING（駆逐艦・重巡は数えない・沈み始めた／海域の外の艦は数えない）。報告の隻数は送るまでの最大。
// - 追う: レーダーの最後の掃引に接触があるステップの固定ステップの実秒だけを足し、20 秒で送る（命中スローで延びない＝世界の stepTimeS の差）。レーダーの無い夜は目で見えている列の艦。
// - 無線: 送る前の敵の艦の砲弾 1 発ごと（damage 1 以上＝機銃も。v0.8.2 IP4。前は 76 mm 以上）に seed+45 を 1 回引き 30%。damage 0 は引かない・送った後は引かない・沈み始めた自艇は引かない。壊れていれば中継待ち→黄色い輪で中継。
// - 達成は届いて帰投と同じに数える終わり（沈めば届いていても達成でない）。呼びかけ（returnCallDone）は届いた時から。ほかの任務の世界は recon が null（命中の手は世界の hitBoat そのもの）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { hasHardVariant } from '../src/config/mission-data';
import type { BoatState } from '../src/core/boat-motion';
import type { HitSpec } from '../src/core/gunnery';
import type { MissionEndReason } from '../src/core/mission-flow';
import { RECON_EV_PENDING, RECON_EV_RADIO, RECON_EV_RELAYED, RECON_EV_SEEN, RECON_EV_SENT, RECON_NONE, RECON_PENDING, RECON_RADIO_SEED_OFFSET, RECON_RELAYED, RECON_SENT, RECON_TRACKING } from '../src/core/recon-report';
import { SeededRng } from '../src/core/rng';
import { FIXED_STEP_S } from '../src/config/step-config';
import { objectiveDoneOf, type ObjectiveWorld } from '../src/systems/mission-objective';
import { magazineTelemetryPart, reconTelemetryPart } from '../src/systems/recon-telemetry';
import { WorldRecon, type ReconShip } from '../src/systems/world-recon';
import { sceneOf, setupOf, type ColGroup } from './column-world-kit';
import { code } from './core-rules-kit';
import { chain } from './torpedo-free-kit';

const YAMASHIRO = 5;
const FUSO = 6;
type BuildEnemies = (...a: unknown[]) => { destroyers: ColGroup | null; recon: WorldRecon | null };
const { buildEnemies } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'world-enemies'].join('/'))) as { buildEnemies: BuildEnemies };
const PROTO_IDS = (gameData.missionsSeed.missions as unknown as Record<string, unknown>[]).filter((m) => m['v0_1_prototype']).map((m) => m['id'] as string);

interface Mini {
  r: WorldRecon;
  ships: { out: boolean; state: { x: number; y: number } }[];
  w: { stepTimeS: number; visRange2: number; boat: { sinking: boolean; state: { x: number; y: number } }; destroyers: { ships: ReconShip[] }; radar: { state: { n: number } } | null };
  step: (n?: number) => number;
}
/** us_05 の報告（setup の値）と素の 7 隻（みな遠く・海域の中）。自艇は (0, 0)・レーダーの接触 0 */
function mini(o: { seed?: number; radar?: boolean; radioFail?: boolean; radioOff?: boolean; hard?: boolean } = {}): Mini {
  const s = setupOf('us_05', o.hard ?? false, undefined, { radioFail: o.radioFail, radioOff: o.radioOff });
  const n = s.transit!.column!.length;
  const ships = Array.from({ length: n }, () => ({ out: false, state: { x: 9000, y: 9000 } }));
  const boat = { sinking: false, state: { x: 0, y: 0 } };
  const w = { stepTimeS: 0, visRange2: s.visRange2, boat, destroyers: { ships }, radar: o.radar === false ? null : { state: { n: 0 } } };
  const r = new WorldRecon(s.recon!, s.transit!.column!, 0, o.seed ?? 1, w, null);
  const step = (k = 1): number => {
    let bits = 0;
    for (let i = 0; i < k; i++) {
      w.stepTimeS += FIXED_STEP_S;
      r.step(w);
      bits |= r.events;
    }
    return bits;
  };
  return { r, ships, w, step };
}
const near = (m: Mini, i: number): void => { m.ships[i]!.state.x = 300; m.ships[i]!.state.y = 0; }; // 視程（半月 1,500 m）の内
const SPEC = (damage: number): HitSpec => ({ damage } as HitSpec);

describe('確かめる（D-N1）', () => {
  it('駆逐艦・重巡が目の前にいても NONE。戦艦が視程の内に入ったステップに TRACKING（秒・隻数 1）。もう 1 隻が送る前に入れば隻数 2', () => {
    const m = mini();
    for (const i of [0, 1, 2, 3, 4]) near(m, i);
    m.step(120);
    expect(m.r.state.stage).toBe(RECON_NONE);
    near(m, FUSO);
    const t = m.w.stepTimeS + FIXED_STEP_S;
    expect(m.step() & RECON_EV_SEEN).toBe(RECON_EV_SEEN);
    expect([m.r.state.stage, m.r.state.seenAtS, m.r.state.seenCount]).toEqual([RECON_TRACKING, t, 1]);
    near(m, YAMASHIRO);
    m.step();
    expect(m.r.state.seenCount).toBe(2);
  });
  it('沈み始めた・海域の外の戦艦（out）と、視程の外の戦艦は数えない', () => {
    const m = mini();
    near(m, YAMASHIRO);
    m.ships[YAMASHIRO]!.out = true;
    m.ships[FUSO]!.state.x = Math.sqrt(m.w.visRange2) + 1;
    m.ships[FUSO]!.state.y = 0;
    m.step(60);
    expect(m.r.state.stage).toBe(RECON_NONE);
    m.ships[FUSO]!.state.x -= 2;
    m.step();
    expect(m.r.state.stage).toBe(RECON_TRACKING);
  });
});

describe('追う・送る（D-N2・D-N3）', () => {
  it('接触のあるステップの実秒だけ足して 20 秒で送る（接触 0 のステップは数えない）。送った後は戦艦の距離を測らない（隻数は送った時のまま）', () => {
    const m = mini();
    near(m, YAMASHIRO);
    m.step();
    m.w.radar!.state.n = 3;
    m.step(600); // 10 秒
    m.w.radar!.state.n = 0;
    m.step(600); // 数えない
    expect(m.r.state.trackedS).toBeCloseTo(10, 9);
    m.w.radar!.state.n = 1;
    let bits = 0;
    while (m.r.state.stage === RECON_TRACKING) bits |= m.step();
    expect(bits & RECON_EV_SENT).toBe(RECON_EV_SENT);
    expect(m.r.state.stage).toBe(RECON_SENT);
    expect(Math.abs(m.r.state.sentAtS - (1 + 600 + 600 + 600) * FIXED_STEP_S)).toBeLessThanOrEqual(1.01 * FIXED_STEP_S); // 確かめた 1 ・接触 10 秒・接触なし 10 秒・接触 10 秒
    expect(m.r.delivered).toBe(true);
    near(m, FUSO);
    m.step(10);
    expect(m.r.state.seenCount).toBe(1);
  });
  it('レーダーの無い夜（?debug&noradar）は目で見えている列の艦を接触に数える（追う・送るは同じ）', () => {
    const m = mini({ radar: false });
    near(m, YAMASHIRO);
    m.step(1);
    m.step(20 * 60 + 2);
    expect(m.r.state.stage).toBe(RECON_SENT);
    const k = mini({ radar: false });
    near(k, YAMASHIRO);
    k.step(1);
    k.ships[YAMASHIRO]!.state.x = 9000; // 目で見えなくなった
    k.step(30 * 60);
    expect([k.r.state.stage, k.r.state.trackedS]).toEqual([RECON_TRACKING, 0]);
  });
  it('時計は世界の stepTimeS の差（命中スローの体感の時計ではない）: 1 ステップは FIXED_STEP_S', () => {
    const m = mini();
    m.step(90);
    expect(m.r.state.clockS).toBeCloseTo(90 * FIXED_STEP_S, 12);
    expect(code('src/systems/world-recon.ts')).toContain('const dtS = w.stepTimeS - this.lastS;');
  });
});

describe('無線（D-N4）と中継（D-N5）', () => {
  it('送る前の damage ≥ 1 の 1 発ごと（機銃 25 mm の 4 も）に seed+45 をちょうど 1 回引く（写しと同じ結果）。damage 0 は引かない。壊れたら次の stepRecon に印', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = mini({ seed });
      const rep = new SeededRng((seed + RECON_RADIO_SEED_OFFSET) >>> 0);
      expect(m.r.onShellHit(0)).toBe(false);
      let broke = -1;
      for (let k = 0; k < 6 && broke < 0; k++) {
        const want = rep.next() < 0.3;
        expect(m.r.onShellHit(k % 2 ? 4 : 40), `seed ${seed} ${k}`).toBe(want);
        if (want) broke = k;
      }
      expect(m.r.state.draws, `seed ${seed}`).toBe(broke < 0 ? 6 : broke + 1);
      if (broke >= 0) {
        expect(m.step() & RECON_EV_RADIO).toBe(RECON_EV_RADIO);
        expect(m.r.onShellHit(40)).toBe(false); // 壊れた後は引かない
        expect(m.r.state.draws).toBe(broke + 1);
      }
    }
  });
  it('30%: seed 1〜3000 の 1 発目で壊れる割合は 0.30 ± 0.03（機銃の 4 でも引く）', () => {
    let k = 0;
    for (let seed = 1; seed <= 3000; seed++) if (mini({ seed }).r.onShellHit(4)) k++;
    expect(Math.abs(k / 3000 - 0.3)).toBeLessThanOrEqual(0.03);
  });
  it('送った後・自艇が沈み始めた後は引かない。?debug&noradio（0）でも引く回数は同じで壊れない', () => {
    const m = mini();
    near(m, YAMASHIRO);
    m.w.radar!.state.n = 1;
    m.step(21 * 60);
    expect(m.r.state.stage).toBe(RECON_SENT);
    expect([m.r.onShellHit(40), m.r.state.draws]).toEqual([false, 0]);
    const s = mini();
    s.w.boat.sinking = true;
    expect([s.r.onShellHit(40), s.r.state.draws]).toEqual([false, 0]);
    const off = mini({ radioOff: true });
    for (let k = 0; k < 20; k++) expect(off.r.onShellHit(40)).toBe(false);
    expect([off.r.state.draws, off.r.plan.radioFailChance]).toEqual([20, 0]);
  });
  it('?debug&radiofail: 1 発で壊れ、20 秒追うと中継待ち。中継の輪（隣の分隊。半径 250 m）に入ったステップに中継（止まらなくてよい）＝届いた。沈み始めた自艇は中継しない', () => {
    const m = mini({ radioFail: true });
    expect(m.r.onShellHit(35)).toBe(true);
    near(m, YAMASHIRO);
    m.w.radar!.state.n = 2;
    let bits = 0;
    while (m.r.state.stage !== RECON_PENDING) bits |= m.step();
    expect(bits & (RECON_EV_SEEN | RECON_EV_RADIO | RECON_EV_PENDING)).toBe(RECON_EV_SEEN | RECON_EV_RADIO | RECON_EV_PENDING);
    expect(m.r.delivered).toBe(false);
    const relay = m.r.plan.relay;
    expect([relay.x, relay.y, relay.radiusM, relay.labelJa]).toEqual([1600, 500, 250, '隣の分隊']); // v0.8.2 IP3 で (1600, 800) → (1600, 500)
    m.w.boat.state.x = relay.x + relay.radiusM + 1;
    m.w.boat.state.y = relay.y;
    m.step(60);
    expect(m.r.state.stage).toBe(RECON_PENDING);
    m.w.boat.sinking = true;
    m.w.boat.state.x = relay.x;
    m.step(5);
    expect(m.r.state.stage).toBe(RECON_PENDING);
    m.w.boat.sinking = false;
    expect(m.step() & RECON_EV_RELAYED).toBe(RECON_EV_RELAYED);
    expect([m.r.state.stage, m.r.delivered]).toEqual([RECON_RELAYED, true]);
  });
});

describe('達成と呼びかけ（D-N6）', () => {
  const ow = (r: WorldRecon | null): ObjectiveWorld => ({ recon: r, landing: null, convoy: null, escort: null, pts: null, patrol: null, enemy: { objectiveDone: false }, detect: { count: 0 } });
  it('届いて帰投と同じに数える終わりだけ達成。沈没・漂流・座礁は届いていても達成でない。届く前の帰投は達成でない', () => {
    const m = mini();
    const reasons: MissionEndReason[] = ['returned', 'destroyed', 'adrift', 'grounded'];
    expect(reasons.map((x) => objectiveDoneOf(x, ow(m.r)))).toEqual([false, false, false, false]);
    near(m, YAMASHIRO);
    m.w.radar!.state.n = 1;
    m.step(21 * 60);
    expect(reasons.map((x) => objectiveDoneOf(x, ow(m.r)))).toEqual([true, false, false, false]);
    expect(objectiveDoneOf('returned', ow(null))).toBe(false); // recon の無い世界は今の式（敵の側の目標）
  });
  it('配線の文: 達成は mission-objective の先頭の 1 行・呼びかけは敵の側の目標か届いた・報告の段はレーダーの後・中継の輪は世界の破棄で消す', () => {
    const o = code('src/systems/mission-objective.ts');
    const body = o.slice(o.indexOf('export function objectiveDoneOf'));
    expect(body.split('\n')[1]!.trim()).toBe('if (w.recon) return reconObjectiveDone(w.recon.state, reason);');
    expect(code('src/systems/mission-world.ts')).toContain('this.enemy.objectiveDone || (this.recon !== null && this.recon.delivered); }');
    expect(code('src/systems/mission-world.ts')).toContain('this.recon = en.recon;');
    const e = code('src/systems/world-enemy-step.ts');
    expect(e.indexOf('w.recon?.step(w);')).toBeGreaterThan(e.indexOf('w.radar?.step(w);'));
    expect(code('src/systems/world-visuals.ts')).toContain('w.recon?.destroy();');
  });
});

describe('無線の手（world-enemies。L22）', () => {
  const boat: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
  it('us_05: 艦の砲弾の命中の手がどの砲でも無線を引き（v0.8.2 IP4＝機銃も）、どの弾も世界の hitBoat へ（同じ spec・seed+1 の系列）', () => {
    const s = setupOf('us_05', false, 5);
    const got: HitSpec[] = [];
    const sinking = { boat: { sinking: false } };
    const e = buildEnemies(sceneOf(), s, 5, boat, chain, {}, (spec: HitSpec) => got.push(spec), () => undefined, { stepTimeS: 0, ...sinking }, null);
    const g = e.destroyers!;
    const r = e.recon!;
    expect(r).toBeInstanceOf(WorldRecon);
    let draws = 0;
    for (let i = 0; i < g.total; i++) {
      const guns = g.gunneryAt(i).guns;
      for (let gi = 0; gi < guns.length; gi++) {
        if (r.state.radioBroken) break;
        (g.fires[i] as unknown as { onHit(gi: number, x: number, y: number): void }).onHit(gi, 1, 2);
        expect(got.pop(), `${i} ${gi}`).toBe(guns[gi]);
        if (guns[gi]!.damage >= s.recon!.radioMinDamage) draws++;
        expect(r.state.draws, `${i} ${gi}`).toBe(draws);
      }
    }
    // v0.8.2 IP4（ユーザーの選び「機銃弾でも抽選」）: 記録の砲はみな引く（127 mm・152 mm〔40・35〕も 25 mm〔4〕も。damage 1 以上）
    const dmg = s.transit!.column!.flatMap((k) => k.gunnery.guns.map((x) => [x.id, x.damage >= s.recon!.radioMinDamage] as const));
    for (const [id, draw] of dmg) expect(draw, id).toBe(true);
  });
  it('ほかの駆逐艦の隊の任務（ハードも）は recon が null。命中の手を包むのは recon の世界だけ（無い任務は世界の hitBoat そのもの）', () => {
    for (const id of PROTO_IDS) {
      for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) {
        const s = setupOf(id, hard, 4);
        if (!s.destroyer || s.barges || s.ptBoats) continue;
        const e = buildEnemies(sceneOf(), s, 4, boat, chain, {}, () => undefined, () => undefined, { stepTimeS: 0 }, null);
        expect(e.recon === null, `${id} ${hard}`).toBe(id !== 'us_05');
      }
    }
    const we = code('src/systems/world-enemies.ts');
    expect(we).toContain('const shipHit = recon ? (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason): void => { recon.onShellHit(spec.damage); hitBoat(spec, rng, x, y, reason); } : hitBoat;');
    expect(we).toContain("f.setHitHandler((gunIndex, x, y) => shipHit(destroyers.gunneryAt(i).guns[gunIndex]!, gunRng, x, y, 'destroyed'))");
    expect(we.split('recon.onShellHit(').length - 1).toBe(1); // 僚艇の手・大発・米PT・機は引かない
  });
});

describe('テレメトリ（L17: 無い任務は鍵ごと無い）', () => {
  it('recon の無い世界・弾薬庫の無い隊は {}。us_05 は recon と magazine の鍵が出る', () => {
    const none = { recon: null, destroyers: { magazine: null }, boat: { state: { x: 0, y: 0 } } };
    expect([reconTelemetryPart(none), magazineTelemetryPart(none), magazineTelemetryPart({ ...none, destroyers: null })]).toEqual([{}, {}, {}]);
    const m = mini();
    const t = reconTelemetryPart({ recon: m.r, destroyers: null, boat: { state: { x: 100, y: 200 } } }).recon!;
    expect([t.stage, t.relayDx, t.relayDy, t.relayRadiusM, t.relayJa]).toEqual([RECON_NONE, 1500, 300, 250, '隣の分隊']); // 中継の輪 (1600, 500)（v0.8.2 IP3。前は 800）− 自艇 (100, 200)
    for (const f of ['src/systems/telemetry-create.ts']) expect(code(f)).toMatch(/\.\.\.reconTelemetryPart\(w\),[\s\S]*\.\.\.magazineTelemetryPart\(w\),/);
  });
});
