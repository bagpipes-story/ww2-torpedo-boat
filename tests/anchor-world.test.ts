// v0.8.1 S2（spec-v0810 §3.2 D-S3〜D-S7・§6 の S2「tests/anchor-world」、lead の L30〜L35）: 止まった艦の世界の配線（systems/destroyer-anchor・destroyer-step・destroyer-group・
// entities/destroyer・world-enemies）を Phaser なしの小さな世界（tests/anchor-world-kit。艦の段は本物の destroyer-step）で確かめる:
// - 止まった艦は動かず当たりの円も作った時のまま（見張りは走る）・5 つの理由で気づく・駆逐艦は気づいて体感 3 秒で動き出す（命中スローで延びる。v0.8.1 S3 の探りの帯で 6 → 3）・空知丸は夜明けの後も動かない・警報は 4 秒。
// - 夜明けは遅れなしで動き出し、卯月は東へ退く。空知丸が残るので隊の allOut・allSettled は偽のまま＝夜は帰投・漂流で終わる（us_06 に fleet_gone_clears は無い）。
// - 止まった艦の見張りの乱数の引き方は止まっていない艦と同じ入力で同じ。止まった艦の無い任務の d.step に渡る距離は w.detectRangeM そのもの（anchored はいつも偽）。
// - S2b（L41・L43）: ハードの隊は駆逐艦 → 輸送船 → 駆潜艇 2 の 4 隻（計画は [3, null, 4, 4]＝S2 の 2 隻の固定を直した。駆潜艇の規則は tests/picket-world）。L35: v0_1_prototype・岸・駆逐艦の隊を持つ任務は us_06 だけ（探照灯が岸で切れる任務が黙って増えない）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { hasHardVariant } from '../src/config/mission-data';
import { ANCHOR_ALERT, ANCHOR_ASLEEP, ANCHOR_REASON_ALARM, ANCHOR_REASON_DAWN, ANCHOR_REASON_HIT, ANCHOR_REASON_SEEN, ANCHOR_REASON_WAKE, ANCHOR_UNDERWAY } from '../src/core/anchored-ship';
import { SeededRng } from '../src/core/rng';
import { MissionEnd } from '../src/systems/mission-end';
import { anchorTelemetryPart, refreshAnchorTelemetry } from '../src/systems/anchor-telemetry';
import { DestroyerAnchor } from '../src/systems/destroyer-anchor';
import { AnchorKitShip, anchorKit, anchorStep, runUntil, type AnchorKitWorld } from './anchor-world-kit';
import { code } from './core-rules-kit';

const STEP = FIXED_STEP_S;
const UZ = 0; // 卯月（隊の 1 隻目）
const SM = 1; // 空知丸（輸送船）
const near = (a: number, b: number, tol = STEP * 1.01): boolean => Math.abs(a - b) <= tol;
const pos = (w: AnchorKitWorld, i: number): number[] => { const s = w.destroyers.ships[i]!.state; return [s.x, s.y, s.headingDeg, s.speedMps]; };
const anchors = (w: AnchorKitWorld) => w.destroyers.anchors!;
/** 自艇を卯月の真北 m に置く（背に岸なし＝世界の距離のまま） */
const northOfUzuki = (w: AnchorKitWorld, m: number): void => {
  const u = w.destroyers.ships[UZ]!.state;
  Object.assign(w.boat.state, { x: u.x, y: u.y - m });
};

describe('止まった艦（us_06 ノーマル・揺らぎなし）', () => {
  it('作る時に卯月と空知丸を止める（速さ 0・anchored）。自艇が遠ければ 60 秒たっても位置・針路・当たりの円は作った時のまま、誰も気づかない（見張りは走るが乱数は引かない）', () => {
    const w = anchorKit();
    const g = w.destroyers;
    expect(g.ships.length).toBe(2);
    expect(anchors(w).plan.underwayS).toEqual([3, null]);
    const start = [pos(w, UZ), pos(w, SM)];
    const circles = g.ships.map((d) => JSON.stringify(d.circles));
    expect(start.map((p) => p[3])).toEqual([0, 0]);
    expect(g.ships.map((d) => d.anchored)).toEqual([true, true]);
    expect([start[0]!.slice(0, 3), start[1]!.slice(0, 3)]).toEqual([[3620, 2380, 270], [3000, 2760, 135]]);
    runUntil(w, 60);
    expect([pos(w, UZ), pos(w, SM)]).toEqual(start);
    expect(g.ships.map((d) => JSON.stringify(d.circles))).toEqual(circles);
    expect(Array.from(anchors(w).state.stage)).toEqual([ANCHOR_ASLEEP, ANCHOR_ASLEEP]);
    expect(g.ships.map((d) => d.ai.mode)).toEqual(['cruise', 'cruise']); // AI は判断していた（端の向き直しで哨戒の針路を書く）が、舵は使わない
  });

  it('① 見た: 卯月が自艇を見つけて気づき、体感 3 秒で動き出す（速さ 0 から加速）。空知丸は警報の 4 秒で気づき、動かない。記録は世界の秒', () => {
    const w = anchorKit();
    runUntil(w, 10);
    northOfUzuki(w, 300); // 停止の 480 m の内
    const t0 = w.stepTimeS + STEP;
    runUntil(w, t0 + 2);
    const a = anchors(w);
    expect([a.state.reason[UZ], a.state.stage[UZ]]).toEqual([ANCHOR_REASON_SEEN, ANCHOR_ALERT]);
    expect(near(a.log.noticedAtS[UZ]!, t0)).toBe(true);
    expect(w.destroyers.ships[UZ]!.anchored).toBe(true);
    runUntil(w, t0 + 2.9);
    expect(w.destroyers.ships[UZ]!.anchored).toBe(true);
    runUntil(w, t0 + 3.2);
    expect([w.destroyers.ships[UZ]!.anchored, a.state.stage[UZ]]).toEqual([false, ANCHOR_UNDERWAY]);
    expect(near(a.log.underwayAtS[UZ]! - a.log.noticedAtS[UZ]!, 3)).toBe(true);
    const before = pos(w, UZ);
    const circles = JSON.stringify(w.destroyers.ships[UZ]!.circles);
    runUntil(w, t0 + 12);
    expect([a.state.reason[SM], a.state.stage[SM]]).toEqual([ANCHOR_REASON_ALARM, ANCHOR_ALERT]); // 空知丸の警報は卯月が動き出した後（警報 4 秒 ＞ 3 秒）
    expect(near(a.log.noticedAtS[SM]! - a.log.noticedAtS[UZ]!, 4)).toBe(true); // 警報 4 秒
    const after = pos(w, UZ);
    expect(after[3]!).toBeGreaterThan(0);
    expect(Math.hypot(after[0]! - before[0]!, after[1]! - before[1]!)).toBeGreaterThan(1);
    expect(JSON.stringify(w.destroyers.ships[UZ]!.circles)).not.toBe(circles); // 動き出した後の当たりの円は今の式で作り直す
    expect(pos(w, SM).slice(0, 4)).toEqual([3000, 2760, 135, 0]);
    expect(w.destroyers.ships[SM]!.anchored).toBe(true);
    expect([a.log.noticedCount, a.log.underwayCount]).toEqual([2, 1]);
  });

  it('② 雷跡: 卯月へ向かう魚雷が見える距離（2,000 m）の内なら見張りが毎秒 0.2 で気づく（seed+17 の今の引き方）。空知丸は警報', () => {
    const w = anchorKit();
    w.torpedoes.states.push({ active: true, x: 4800, y: 1500, headingDeg: 233 }); // 卯月の北東 1,472 m から卯月へ（空知丸からは 2,197 m＝見える距離 2,000 m の外）
    runUntil(w, 40);
    const a = anchors(w);
    expect(a.state.reason[UZ]).toBe(ANCHOR_REASON_WAKE);
    expect(a.log.noticedAtS[UZ]!).toBeLessThan(30);
    expect(a.state.reason[SM]).toBe(ANCHOR_REASON_ALARM);
  });

  it('③ 被雷: 当たれば（hitsTaken ＞ 0）気づく。動き出すのは同じ 3 秒後', () => {
    const w = anchorKit();
    runUntil(w, 5);
    w.destroyers.ships[UZ]!.hitsTaken = 1;
    runUntil(w, 12);
    const a = anchors(w);
    expect(a.state.reason[UZ]).toBe(ANCHOR_REASON_HIT);
    expect(w.destroyers.ships[UZ]!.anchored).toBe(false);
    expect(near(a.log.underwayAtS[UZ]! - a.log.noticedAtS[UZ]!, 3)).toBe(true);
  });

  it('体感の時計: 気づいた後に命中スローがあれば動き出すのは固定ステップの時計で遅れる（AI の反応遅れと同じ時計）', () => {
    const w = anchorKit();
    w.destroyers.ships[UZ]!.hitsTaken = 1;
    let k = 0;
    while (w.stepTimeS < 15) anchorStep(w, k++ < Math.round(w.setup.slowMoSeconds / STEP));
    const a = anchors(w);
    const lost = w.setup.slowMoSeconds * (1 - w.setup.slowMoFactor);
    expect(near(a.log.underwayAtS[UZ]! - a.log.noticedAtS[UZ]!, 3 + lost, STEP * 2)).toBe(true);
  });

  it('⑤ 夜明け: 遅れなしで動き出し（気づいたステップに）、卯月は東へ退いて海域を出る。空知丸は退く向きが立っても動かず、退いたにもならない＝allOut・allSettled は偽のまま', () => {
    const w = anchorKit({ dawnS: 30 });
    runUntil(w, 30 + STEP / 2);
    const a = anchors(w);
    expect([a.state.reason[UZ], a.state.reason[SM]]).toEqual([ANCHOR_REASON_DAWN, ANCHOR_REASON_DAWN]);
    expect(a.log.underwayAtS[UZ]).toBe(a.log.noticedAtS[UZ]);
    expect(w.destroyers.ships[UZ]!.anchored).toBe(false);
    const sm = pos(w, SM);
    runUntil(w, 90);
    const uz = w.destroyers.ships[UZ]!;
    expect(uz.ai.mode).toBe('retire');
    expect(uz.state.x).toBeGreaterThan(3620 + 500);
    expect(Math.abs(uz.state.headingDeg - 90)).toBeLessThan(1);
    runUntil(w, 600);
    expect(uz.withdrawn).toBe(true);
    const s = w.destroyers.ships[SM]!;
    expect([pos(w, SM), s.anchored, s.ai.retiring, s.withdrawn, s.out]).toEqual([sm, true, true, false, false]);
    expect(Number.isNaN(a.log.underwayAtS[SM]!)).toBe(true);
    expect([w.destroyers.allOut, w.destroyers.allSettled]).toEqual([false, false]);
  });

  it('夜の終わり: 空知丸が残っても今のまま帰投・漂流で終わる（fleet_gone_clears なし＝「敵艦隊なし」にしない）', () => {
    const w = anchorKit({ dawnS: 30 });
    runUntil(w, 600);
    expect(w.setup.dawnAir.fleetGoneClears).toBe(false);
    const view = (o: { atHome?: boolean; fuelEmpty?: boolean; stopped?: boolean }) => ({
      boat: { sinking: false }, atHome: o.atHome ?? false, grounded: false, torpedoesRunning: false, torpedoes: { unresolvedCount: 0 },
      enemy: { sinkPlaying: false, allOut: w.destroyers.allOut }, fuel: { empty: o.fuelEmpty ?? false }, band: o.stopped ? 'stop' : 'cruise', stepTimeS: w.stepTimeS,
    });
    const end = new MissionEnd(w.setup.mission.returnPoint, 1.5, w.setup.dawnAir.fleetGoneClears);
    expect(end.step(view({}), 0, -1)).toBe(null);
    expect(end.step(view({ fuelEmpty: true, stopped: true }), 5, -1)).toBe('adrift');
    expect(new MissionEnd(w.setup.mission.returnPoint, 1.5, false).step(view({ atHome: true }), 0, -1)).toBe('returned');
  });

  it('テレメトリ: 止まった艦の任務だけ anchor の鍵（配列は世界の参照・数は写す）。無い任務（us_02）は鍵ごと無い', () => {
    const w = anchorKit();
    const part = anchorTelemetryPart(w);
    const t = part.anchor!;
    expect(t.stage).toBe(anchors(w).state.stage);
    expect(t.noticedAtS).toBe(anchors(w).log.noticedAtS);
    northOfUzuki(w, 300);
    runUntil(w, 20);
    refreshAnchorTelemetry(t, w);
    expect([t.noticedCount, t.underwayCount, t.heldShots, t.heldHits]).toEqual([2, 1, 0, 0]);
    expect(anchorTelemetryPart(anchorKit({ mission: 'us_02' }))).toEqual({});
    const tc = code('src/systems/telemetry-create.ts');
    expect(tc).toContain('...anchorTelemetryPart(w),');
    expect(code('src/systems/mission-telemetry.ts')).toContain('refreshAnchorTelemetry(t.anchor, w);');
  });
});

describe('見張りの乱数（D-S3）と止まった艦の無い任務', () => {
  class CountingRng extends SeededRng {
    draws = 0;
    override next(): number {
      this.draws++;
      return super.next();
    }
  }
  it('止まった艦は止まっていない艦と同じ入力で同じ回数・同じ値を引き、AI の状態も同じ（舵と速さを使わないだけ）', () => {
    const w = anchorKit();
    const ds = w.setup.destroyer!;
    const st = ds.starts[0]!;
    const [ra, rb] = [new CountingRng(77), new CountingRng(77)];
    const a = new AnchorKitShip(st, ds.spec, ds.shipAi, w.setup.mission.bounds, ra);
    const b = new AnchorKitShip(st, ds.spec, ds.shipAi, w.setup.mission.bounds, rb);
    a.anchored = true;
    a.state.speedMps = 0;
    const torp = [{ active: true, x: st.x, y: st.y - 1500, headingDeg: 180 }];
    const player = { x: st.x + 900, y: st.y - 900, headingDeg: 0, speedMps: 0 };
    let drawsSeen = 0;
    for (let k = 0; k < 60 * 20; k++) {
      Object.assign(b.state, a.state); // 同じ入力（位置・針路・速さ 0）
      if (k === 600) torp[0]!.active = false; // 雷跡が消える → 次の魚雷は気づき直す
      if (k === 700) torp[0]!.active = true;
      a.step(STEP * w.setup.timeScale, STEP, player, 480, w.setup.vis.detectHoldS, torp);
      b.step(STEP * w.setup.timeScale, STEP, player, 480, w.setup.vis.detectHoldS, torp);
      expect(ra.draws, String(k)).toBe(rb.draws);
      expect(JSON.stringify(a.ai), String(k)).toBe(JSON.stringify(b.ai));
      drawsSeen = ra.draws;
    }
    expect(drawsSeen).toBeGreaterThan(1);
    expect([a.state.x, a.state.y, a.state.speedMps]).toEqual([st.x, st.y, 0]);
  });

  for (const id of ['us_01', 'us_02', 'jp_06']) {
    it(`${id}（止まった艦も背に岸も無い）: 隊は anchors・backdrop が null で、d.step に渡る距離は毎ステップ w.detectRangeM そのもの・anchored はいつも偽`, () => {
      const w = anchorKit({ mission: id, seed: 3 });
      expect([w.destroyers.anchors, w.destroyers.backdrop, w.setup.anchors, w.setup.backdrop]).toEqual([null, null, undefined, undefined]);
      for (let k = 0; k < 600; k++) {
        w.detectRangeM = 400 + ((k * 37.123) % 1700);
        anchorStep(w);
        for (const d of w.destroyers.ships) {
          expect(Object.is(d.lastDetectM, w.detectRangeM)).toBe(true);
          expect(d.anchored).toBe(false);
        }
      }
    });
  }
});

describe('配線の source（L30〜L35）', () => {
  /** クラスのメソッドの本体（名前の後の最初の { から数える） */
  const method = (src: string, head: string): string => {
    const i = src.indexOf(head);
    expect(i, head).toBeGreaterThanOrEqual(0);
    const open = src.indexOf('{', i + head.length - 1);
    let j = open + 1;
    for (let depth = 1; depth > 0; j++) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
    return src.slice(open + 1, j - 1);
  };
  it('Destroyer.step: 見張り（updateShipAi）→ 止まっていれば戻る → 舵 → 縁 → 円。素の艦（kit）も同じ文', () => {
    const d = code('src/entities/destroyer.ts');
    const body = method(d, '  step(dt: number, realDt: number, player: BoatState,');
    const order = ['if (this.out) return false;', 'updateShipAi(this.ai, this.state, player, playerDetectRangeM, detectHoldS, torpedoes, this.aiParams, this.bounds, realDt, this.lookoutRng);', 'if (this.anchored) return false;', 'steerShip(this.state, this.ai.desiredHeadingDeg, this.ai.desiredSpeedMps, turnRateFor(this.ai.mode, this.aiParams), this.aiParams.accelMps2, dt);', 'if (!this.ai.retiring) clampToBounds(', 'this.refreshHull();'];
    const at = order.map((p) => body.indexOf(p));
    expect(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1]!)), at.join(' ')).toBe(true);
    expect(d).toContain('  anchored = false;');
    expect(d.match(/\banchored\b/g)!.length).toBe(2); // 欄と step の 1 行だけ（立てる・下ろすは systems/destroyer-anchor）
    const k = readFileSync('tests/anchor-world-kit.ts', 'utf8');
    expect(k).toContain('if (this.anchored) return false; // Destroyer.step と同じ（v0.8.1 S2）');
    expect(k).toContain('updateShipAi(this.ai, this.state, player, playerDetectRangeM, detectHoldS, torpedoes as never, this.aiParams, this.bounds, realDt, this.lookoutRng);');
  });
  it('付け方: world-enemies は岸の線（landLinesOf）を 1 回作り、探照灯・背に岸・止まった艦を隊に付ける。隊の計画は隊の艦の全部（S2b の L43: 駆潜艇も。数が違えば作る時に例外）。kit も同じ', () => {
    const we = code('src/systems/world-enemies.ts');
    expect(we).toContain('if (destroyers && land && s.backdrop) destroyers.setBackdrop(s.backdrop, land, s.seaplane ? s.seaplane.flareRevealM : 0);');
    expect(we).toContain('if (destroyers && s.anchors) destroyers.setAnchors(s.anchors);');
    expect(we).toContain('splashes, shipArtKey(mission.enemyId), s.pickets ?? null) : null;'); // 駆潜艇は隊の新しい最後の引数だけ（S2b の L41。world-enemies はほかに読まない）
    expect(we.match(/pickets/g)).toHaveLength(1);
    const g = code('src/systems/destroyer-group.ts');
    expect(g).toContain('this.anchors = new DestroyerAnchor(this.ships, a, this.ships.length);');
    expect(g).toContain('this.backdrop = new ShoreBackdrop(b, lines, this.ships.length, flareRevealM);');
    expect(g).toContain('this.transportIndex = transport ? this.ships.length : -1;');
    expect(g).toContain('this.picketIndex = pickets ? this.ships.length : -1;');
    for (const get of ['return this.transportIndex >= 0;', 'return this.transportIndex >= 0 && this.ships[this.transportIndex]!.sinking;', 'return this.transportIndex >= 0 && this.ships[this.transportIndex]!.withdrawn;']) expect(g).toContain(get);
    const da = code('src/systems/destroyer-anchor.ts');
    expect(da).toContain('if (setup.underwayS.length !== count || count !== ships.length) throw new Error(');
    const k = code('tests/anchor-world-kit.ts');
    expect(k).toContain('g.anchors = new DestroyerAnchor(ships, setup.anchors, ships.length);');
    expect(k).toContain('g.backdrop = new ShoreBackdrop(setup.backdrop, land, ships.length, setup.seaplane ? setup.seaplane.flareRevealM : 0);');
    const st = code('src/systems/destroyer-step.ts');
    expect(st).toContain('bd ? bd.rangeFor(i, d.state, boat, w) : w.detectRangeM');
    expect(st.indexOf('g.anchors?.step(w, feelDt);')).toBeGreaterThan(st.indexOf('if (g.transit?.step(w, feelDt)) left = true;'));
    expect(st.indexOf('g.anchors?.step(w, feelDt);')).toBeLessThan(st.indexOf('w.torpedoes.step('));
  });
  it('destroyer-anchor・anchor-telemetry・shore-backdrop: Phaser・乱数・平方根なし、毎ステップの本体に確保の形なし、300 行より短い（L33・L34・L37 の行数）', () => {
    const files: [string, number, string[]][] = [
      ['src/systems/destroyer-anchor.ts', 110, ['  step(w: AnchorWorldView, feelDt: number): void {', '  held(i: number): boolean {', '  noteHit(torpedo: object): void {']],
      ['src/systems/anchor-telemetry.ts', 70, ['  step(st: AnchorState, w: AnchorWorldView): void {', 'export function refreshAnchorTelemetry(']],
      ['src/systems/shore-backdrop.ts', 90, ['  rangeFor(i: number,', '  rangeAt(i: number, fallback: number): number {']],
    ];
    for (const [f, max, heads] of files) {
      const raw = readFileSync(f, 'utf8');
      expect(raw.split('\n').length - 1, f).toBeLessThanOrEqual(max);
      const s = code(f);
      expect(s, f).not.toMatch(/from 'phaser'|Math\.random|SeededRng|Math\.(sqrt|hypot|atan2)/);
      for (const h of heads) {
        const body = method(s, h);
        expect(body, `${f} ${h}`).not.toMatch(/\bnew\s|\.(map|filter|slice|concat|push|splice|sort|forEach|fill)\(|=>|`|\.\.\.|\{\s*\w+\s*:|(?:[=(,:?]|\breturn)\s*\[/);
      }
    }
  });
});

describe('ハードの隊（S2b の L41・L43）と岸のある駆逐艦の任務（L35）', () => {
  it('ハードの隊は駆逐艦 → 輸送船 → 駆潜艇 2 の 4 隻で、計画は setup の [3, null, 4, 4] の全部（S2 は 2 隻に切り出していた＝S2b で直した固定）。数が違えば作る時に例外（V-A5）', () => {
    const w = anchorKit({ hard: true, seed: 1 });
    expect(w.setup.pickets!.starts.length).toBe(2);
    expect(w.setup.anchors!.underwayS).toEqual([3, null, 4, 4]);
    expect(w.destroyers.ships.length).toBe(4);
    expect(anchors(w).plan.underwayS).toEqual([3, null, 4, 4]);
    expect(anchors(w).plan.underwayS).not.toBe(w.setup.anchors!.underwayS); // setup は書き換えない（作る時に 1 回写す）
    expect([anchors(w).state.n, w.destroyers.ships.map((d) => d.anchored)]).toEqual([4, [true, true, true, true]]);
    const ships = w.destroyers.ships;
    expect(() => new DestroyerAnchor(ships.slice(0, 2), w.setup.anchors!, 2)).toThrow(/V-A5/);
    expect(() => new DestroyerAnchor(ships, w.setup.anchors!, 2)).toThrow(/止まった艦の計画（anchors\.underwayS 4 隻）と隊の艦（4 隻）/);
  });
  it('v0_1_prototype・岸（coast）・駆逐艦の隊を持つ任務（ハードも）は us_06 だけ（探照灯の絵が岸で切れ、レーダーの陸の反射に南の岸が入る任務。新しい任務は知って足す）', () => {
    const ids = new Set<string>();
    for (const m of gameData.missionsSeed.missions as unknown as Record<string, unknown>[]) {
      const id = m['id'] as string;
      if (!m['v0_1_prototype']) continue;
      for (const hard of hasHardVariant(gameData, id) ? [false, true] : [false]) {
        const pm = getPrototypeMission(gameData, id, hard);
        if (pm.coast && pm.enemyStart && !pm.barges && !pm.ptBoats) ids.add(id);
      }
    }
    expect([...ids]).toEqual(['us_06']);
  });
});
