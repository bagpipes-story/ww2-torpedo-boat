// T-14 の 13mm（v0.6.3 実機 1 回目。spec r1 §E・§H）のテレメトリと Result: 13mm の状態・Result の材料（systems/pt-telemetry）、Result の 4 行と頭（ui/pt-lines）、
// 押さない夜は 13mm の無い米PT の任務と同じ行（離脱・追ってくる PT の行の末尾だけ違う）、押し続ける夜の行（台本）。2 行目の文・優先順・幅は tests/pt-gun-ui.test.ts（レビュー NP-5 で分けた）。
// v0.6.3 実機 2 回目（spec r2 §I.2）: 行の形は追撃の行（連射・追ってくる・連射の結果・制圧）と「全速で」・「残り N 回」のない離脱。
import { describe, expect, it } from 'vitest';
import { GUN_FIRING, GUN_OUT_OF_ARC } from '../src/core/gun-battery';
import { PT_FATE_CREW, PT_FATE_HULL, PT_FATE_SUNK, PT_PASS, PT_SUNK } from '../src/core/pt-boats';
import { PT_GUN_EV_HULL } from '../src/core/pt-damage';
import { initPtTelemetry, ptResult, refreshPtTelemetry } from '../src/systems/pt-telemetry';
import { MISSION_PT_GUN, MISSION_PT_GUN_EVENT } from '../src/ui/mission-mode';
import { ptHeadJa, ptResultLines } from '../src/ui/pt-lines';
import type { PtResult } from '../src/ui/result-types';
import { nightLines } from './pt-night-lines';
import { ptWorld, textWidthPx } from './pt-ui-kit';

describe('13mm のテレメトリと Result の材料（systems/pt-telemetry）', () => {
  it('状態・速い（撃っている間だけ）・距離・命中・撃ったか・交換の残り・出来事・黙った航過', () => {
    const w = ptWorld();
    const q = w.pts.section;
    const g = w.pts.gun!.state;
    const t = initPtTelemetry(w);
    g.battery.status = GUN_OUT_OF_ARC;
    g.battery.fast = true;
    refreshPtTelemetry(t, w);
    expect([t.gunStatus, t.gunFast, t.gunEverFired]).toEqual([GUN_OUT_OF_ARC, false, false]);
    Object.assign(g.battery, { status: GUN_FIRING, targetM: 412.5, shots: 7 });
    g.reloadLeftS = 1.5;
    q.gunHits = 2;
    q.gunEventSeq = 1;
    q.gunEvent = PT_GUN_EV_HULL;
    q.owner = 0;
    q.boats[0]!.phase = PT_PASS;
    q.boats[0]!.fate = PT_FATE_HULL;
    refreshPtTelemetry(t, w);
    expect([t.gunStatus, t.gunFast, t.gunTargetM, t.gunHits, t.gunEverFired, t.reloadLeftS, t.gunEventSeq, t.gunEvent, t.passSilenced, t.fighting]).toEqual([GUN_FIRING, true, 412.5, 2, true, 1.5, 1, PT_GUN_EV_HULL, true, 1]);
  });
  it('Result: 13mm の数・閃光・enemy id。撃退は今の結末で数える（撃退の後に沈んだ PT は撃沈だけ）。砲の無い任務は gunEnabled false で 0', () => {
    const w = ptWorld();
    const q = w.pts.section;
    w.pts.gun!.state.battery.shots = 120;
    Object.assign(q, { gunHits: 9, retired: 2, sunk: 1, flashFirst: true });
    q.boats[0]!.fate = PT_FATE_CREW;
    q.boats[1]!.fate = PT_FATE_SUNK; // 撃退の後に航過を抜けるところで沈んだ（q.retired は 2 のまま）
    q.boats[1]!.phase = PT_SUNK;
    const r = ptResult(w)!;
    expect([r.enemyId, r.gunEnabled, r.gunShots, r.gunHits, r.retired, r.sunk, r.flashFirst]).toEqual(['us_pt_enemy', true, 120, 9, 1, 1, true]);
    const n = ptResult(ptWorld(false))!;
    expect([n.gunEnabled, n.gunShots, n.gunHits, n.retired, n.sunk]).toEqual([false, 0, 0, 0, 0]);
  });
});

/** Result の材料（撃たなかった夜。tests/jp05-mission と同じ形） */
const BASE: PtResult = {
  enemyId: 'us_pt_enemy', total: 2, out: 0, alive: 2, leftAtDawn: false, passes: 5, maxPasses: 8, firedPasses: 4, cleanPasses: 2, shots: 40, hits: 4, damagePerHit: 4, hpMax: 50,
  firstDetectM: 1199.6, firstDetectBand: 'silent', lostContacts: 0, closestM: 120, minWarnS: 2.52,
  gunEnabled: true, gunShots: 0, gunHits: 0, retired: 0, sunk: 0, flashFirst: false, bursts: 0, suppressions: 0,
};

describe('13mm の Result（ui/pt-lines）', () => {
  it('4 行目: 撃った夜は射撃・命中（率）・撃退・撃沈、撃たなかった夜はそう言う、砲の無い任務は出さない。最初に見つかったのが閃光なら 2 行目は「閃光」', () => {
    const fired: PtResult = { ...BASE, gunShots: 236, gunHits: 9, retired: 1, sunk: 0 };
    expect(ptResultLines(fired, 1, true)[3]).toBe('13mm 射撃 236 発 ・ 命中 9（4%） ・ 撃退 1 ・ 撃沈 0');
    // 当てたのに 0% と出さない（レビュー ux-4: 「命中 1（0%）」）。当てなければ 0%、1% 以上は四捨五入
    expect(ptResultLines({ ...fired, gunShots: 240, gunHits: 1 }, 1, true)[3]).toBe('13mm 射撃 240 発 ・ 命中 1（1% 未満） ・ 撃退 1 ・ 撃沈 0');
    expect(ptResultLines({ ...fired, gunShots: 240, gunHits: 0 }, 1, true)[3]).toBe('13mm 射撃 240 発 ・ 命中 0（0%） ・ 撃退 1 ・ 撃沈 0');
    expect(ptResultLines({ ...fired, gunShots: 200, gunHits: 2 }, 1, true)[3]).toBe('13mm 射撃 200 発 ・ 命中 2（1%） ・ 撃退 1 ・ 撃沈 0');
    expect(ptResultLines(BASE, 1, true)[3]).toBe('13mm は撃たなかった');
    expect(ptResultLines({ ...BASE, gunEnabled: false }, 1, true)[3]).toBe('');
    expect(ptResultLines(BASE, 1, true)[1]).toBe('見つかった 1 回（最初 1200 m ・ 静音） ・ 見失わせた 0 回');
    expect(ptResultLines({ ...fired, firstDetectM: 520, flashFirst: true }, 1, true)[1]).toBe('見つかった 1 回（最初 520 m ・ 閃光） ・ 見失わせた 0 回');
    // 1・3 行目は 13mm で変わらない
    expect(ptResultLines(fired, 1, true).slice(0, 3)).toEqual([ptResultLines(BASE, 1, true)[0], ptResultLines(BASE, 1, true)[1], ptResultLines(BASE, 1, true)[2]]);
  });
  it('頭: 撃沈・撃退の数（0 は出さない）の後に今までの尾。みな沈めたら尾なし。13mm の効果が無ければ v0.6.3 と同じ', () => {
    expect(ptHeadJa(BASE)).toBe('米PT: 健在 2 隻');
    expect(ptHeadJa({ ...BASE, alive: 0, out: 2 })).toBe('米PT: 去った');
    expect(ptHeadJa({ ...BASE, alive: 0, leftAtDawn: true })).toBe('米PT: 夜明けに去った');
    expect(ptHeadJa({ ...BASE, sunk: 1, retired: 1, alive: 0, out: 1 })).toBe('米PT: 撃沈 1 ・ 撃退 1 ・ 去った');
    expect(ptHeadJa({ ...BASE, sunk: 1, alive: 1 })).toBe('米PT: 撃沈 1 ・ 健在 1 隻');
    expect(ptHeadJa({ ...BASE, retired: 1, alive: 1 })).toBe('米PT: 撃退 1 ・ 健在 1 隻');
    expect(ptHeadJa({ ...BASE, retired: 2, alive: 0, leftAtDawn: true })).toBe('米PT: 撃退 2 ・ 夜明けに去った');
    expect(ptHeadJa({ ...BASE, sunk: 2, alive: 0 })).toBe('米PT: 撃沈 2');
  });
  it('幅: Result の 4 行目と頭（いちばん長い値）は縮めずに画面の幅に収まる（20 px。論理幅 1280 − 左右の HUD_MARGIN 48）', () => {
    const MAX = 1280 - 2 * 24;
    const wide: PtResult = { ...BASE, gunShots: 9999, gunHits: 999, retired: 2, sunk: 2, flashFirst: true, firstDetectM: 1200, lostContacts: 99 };
    for (const l of [...ptResultLines(wide, 99, true).slice(1), ptResultLines({ ...wide, gunHits: 99 }, 99, true)[3]]) expect(textWidthPx(l, 20), l).toBeLessThanOrEqual(MAX);
    for (const head of [ptHeadJa({ ...wide, sunk: 1, retired: 1, alive: 1 }), ptHeadJa({ ...wide, sunk: 1, retired: 1, alive: 0, leftAtDawn: true })]) {
      const status = `${head}   帰投: なし   艇 HP 50 / 50   乗員 7/7   燃料 100%   9999 秒`;
      expect(textWidthPx(status, 20), status).toBeLessThanOrEqual(MAX);
    }
  });
});

describe('射撃を押さない夜（spec r1 §H・spec r2 §I.2）', () => {
  it('砲を積んでいても押さなければ、13mm の無い米PT の任務と同じ行（離脱・追ってくる PT の末尾だけ違う）。13mm の行は出ず、航過の上限は 8 のまま、行はみな決まった形', () => {
    const V063 = [
      /^米PT (航過|掃射)！ (\S+へ全速で転舵|そのまま全速で離れろ)$/,
      /^(かわした！ 被弾なし|被弾 \d+ 発（HP −\d+）|撃たせなかった！) ・ 航過 \d+\/8$/,
      /^米PT (追撃|連射)！ \S+から ・ 針路そのまま撃ち返せ$/,
      /^(連射 被弾なし|連射 被弾 \d+ 発（HP −\d+）|連射を撃たせなかった！) ・ 計 \d+ 回$/,
      /^米PT \S+から追ってくる( \d+ m)? ・ (右下の射撃で撃ち返せ|撃ち返せ|600 m まで引きつけよ)$/,
      /^米PT \S+から突撃 \d+ m ・ 赤い線で転舵$/,
      /^米PT のエンジン音 ・ \S+から突撃$/,
      /^米PT 離脱 ・ (右下の射撃で撃ち返せ|次の赤い線に備えよ)$/,
      /^米PT \d+ m（\S+） ・ 気づかれていない ・ 静音でやり過ごせ$/,
      /^米PT \d+ m ・ 速い！ \d+ m で見つかる ・ 14 kt 以下に$/,
      /^米PT \d+ 隻が哨戒中 ・ 静音で抜けて帰投$/,
      /^(夜明け ・ )?米PT は東へ(去る|去った) ・ 帰投せよ {2}\d+ m$/,
      /^$/, // 米PT のモードでない（帰投せよ・平常）
    ];
    let [results, passes, bursts, burstResults, chasing] = [0, 0, 0, 0, 0];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = nightLines(seed, true);
      const b = nightLines(seed, false);
      // 末尾: 13mm を撃つ前の勧め（砲あり）と、砲の無い任務の離脱「次の赤い線に備えよ」・追ってくる PT「撃ち返せ」（連射の「針路そのまま撃ち返せ」はどちらも同じ）
      const norm = (l: string): string => l.replace(/ ・ (右下の射撃で撃ち返せ|次の赤い線に備えよ|撃ち返せ|600 m まで引きつけよ)$/, ' ・ 〈末尾〉');
      expect(a.lines.map(norm), `${seed}`).toEqual(b.lines.map(norm));
      expect(a.modes.has(MISSION_PT_GUN) || a.modes.has(MISSION_PT_GUN_EVENT), `${seed}`).toBe(false);
      expect([...a.maxPasses], `${seed}`).toEqual([8]);
      for (const l of a.lines) expect(V063.some((re) => re.test(l)), `${seed}: ${l}`).toBe(true);
      results += a.lines.filter((l) => / ・ 航過 \d+\/8$/.test(l)).length;
      passes += a.lines.filter((l) => l.startsWith('米PT 航過！') || l.startsWith('米PT 掃射！')).length;
      bursts += a.lines.filter((l) => l.startsWith('米PT 追撃！') || l.startsWith('米PT 連射！')).length;
      burstResults += a.lines.filter((l) => / ・ 計 \d+ 回$/.test(l)).length;
      chasing += a.lines.filter((l) => l.includes('から追ってくる')).length;
    }
    // 赤い線と航過の結果が出た夜がある（離脱の行は挟み撃ちでもう 1 隻がいつも突撃の行なので、まれ。末尾の違いは上の離脱の行のテスト）。
    // 巡航で帰る艇には航過のあとも追撃の連射（予告と撃ち始め）・その結果・追ってくる PT の行が出る（実機 2 回目）
    expect(passes).toBeGreaterThan(6);
    expect(results).toBeGreaterThan(6);
    expect(bursts).toBeGreaterThan(6);
    expect(burstResults).toBeGreaterThan(3);
    expect(chasing).toBeGreaterThan(0);
  });
});

describe('射撃を押し続ける夜（台本: 見つかったら舷側を向けて止まり、撃ち合う）', () => {
  it('射撃の行・弾倉交換・撃退と撃沈の行が出て、文はみな決まった形。航過中（赤い線）はいつも赤い線の行がいちばん上', () => {
    const GUN = [
      /^射撃中 ・ PT \d+ m ・ (命中 計 \d+|速くて散る（14 kt 以下で）|遠い（300 m 以内で）|遠くて速い（300 m 以内・14 kt 以下で）)$/,
      /^弾倉交換 ・ あと [1-4] 秒$/,
      /^射界外 ・ 舷側に向けよ（艇首・艇尾は撃てない）$/,
      /^射程外 ・ 600 m まで引きつけよ$/,
      /^撃てる PT が見えない$/,
      /^米PT (撃退！ 死傷者が出て離脱|撃退！ 穴だらけで離脱|撃沈！ ガソリンに引火|制圧！ 追撃をやめて離れる)( ・ (連射を撃たせなかった|連射 被弾なし|連射 被弾 \d+ 発（HP −\d+）))? ・ (残り [12] 隻|帰投せよ)$/,
    ];
    // 13mm の行でなければ、v0.6.3 の行か 13mm で変わった行（黙った航過・減る上限・全隻撃沈）か追撃の行（実機 2 回目。黙った連射・減る連射の上限）
    const OTHER = [
      /^米PT (航過|掃射)！ (\S+へ全速で転舵|そのまま全速で離れろ)$/,
      /^米PT (被弾で沈黙！ もう撃ってこない|制圧！ 連射をやめた)$/,
      /^(かわした！ 被弾なし|被弾 \d+ 発（HP −\d+）|撃たせなかった！) ・ 航過 \d+\/[1-8]$/,
      /^米PT (追撃|連射)！ \S+から ・ 針路そのまま(撃ち返せ| 艇尾は撃てない| 艇首は撃てない)$/,
      /^(連射 被弾なし|連射 被弾 \d+ 発（HP −\d+）|連射を撃たせなかった！) ・ 計 \d+ 回$/,
      /^米PT \S+から追ってくる( \d+ m)? ・ (撃ち返せ|600 m まで引きつけよ)$/,
      /^米PT \S+から突撃 \d+ m ・ 赤い線で転舵$/,
      /^米PT のエンジン音 ・ \S+から突撃$/,
      /^米PT 離脱 ・ 次の赤い線に備えよ$/,
      /^米PT \d+ m（\S+） ・ 気づかれていない ・ 静音でやり過ごせ$/,
      /^米PT \d+ m ・ 速い！ \d+ m で見つかる ・ 14 kt 以下に$/,
      /^米PT \d+ 隻が哨戒中 ・ 静音で抜けて帰投$/,
      /^(夜明け ・ )?米PT は(東へ去る|東へ去った|全隻撃沈) ・ 帰投せよ {2}\d+ m$/,
      /^$/,
    ];
    const seen = new Set<string>();
    let events = 0;
    let hidden = 0;
    let heldResults = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = nightLines(seed, true, 'fight');
      expect(r.passTop, `${seed}`).toBe(true);
      events += r.events;
      // R5: 赤い線の下に 2.5 秒より長く隠れた出来事（航過中の PT が撃退されて黙ったまま抜ける）も、線が消えてから出る。出ずに時間切れの出来事は無い
      for (const e of r.hidden) expect(r.shown.has(e), `${seed}: 出来事 ${e}`).toBe(true);
      expect(r.missed, `${seed}`).toBe(0);
      // 航過の結果は出来事の後に回り、赤い線に替わられない限り 2.5 秒出る（出来事と結果の時間が重なって 1 フレームだけ出ることが無い）
      expect(r.shortResults, `${seed}`).toBe(0);
      hidden += r.hidden.size;
      heldResults += r.heldResults;
      for (const l of r.lines) {
        const m = GUN.findIndex((re) => re.test(l));
        if (m >= 0) seen.add(String(m));
        else expect(OTHER.some((re) => re.test(l)), `${seed}: ${l}`).toBe(true);
      }
    }
    expect(seen.has('0') && seen.has('1')).toBe(true); // 射撃中・弾倉交換
    expect(events).toBeGreaterThan(0); // 撃退か撃沈が 12 夜のどこかで
    expect(seen.has('5')).toBe(true);
    expect(hidden).toBeGreaterThan(0); // 赤い線の下に隠れた出来事が 12 夜のどこかで（この確かめが空でない）
    expect(heldResults).toBeGreaterThan(0); // 出来事の後に回った航過の結果も
  });
});
