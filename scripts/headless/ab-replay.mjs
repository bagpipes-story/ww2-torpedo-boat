// 2 つのビルドの再生の A/B（v0.6.10 S5a で作り直した。v0.6.9 の replay-v069.mjs の代わり。spec-v0610 part 2「ab-replay」）: 同じ任務・seed・台本を、ビルド A（基準。例 6856840）と
// B（今の木）のヘッドレスで偽の時計・固定ステップのまま回し、フレームごとの世界の写し（自艇・HP・燃料・駆逐艦・大発・米PT・自艇の魚雷・揚陸の輸送船と敵の魚雷・HUD の文の全部・
// 終わったら Result の文）の指紋を比べる。違えば same:false と最初に違ったフレームと欄を出す（ページは開いたまま写しを取り出す）。
// 台本（下の abRun）: 最寄りの敵へ向かい（遠ければ 0.6・近ければ 0.4、600 m の内は背を向けて 0.8）、敵がいなければゆっくり回る。武器は INPUT で:
//   primary＝主兵装だけ（魚雷は 2,500 m の内の敵がいる間 12 秒ごとに 1 本・機銃は 1,500 m の内の敵がいる間 8 秒のうち 3 秒）・both＝もう一方も同じ間隔で・none＝撃たない。
// 件の組（既定 SET=all）: base（16 件: 7 任務 us_01・us_02・us_03・jp_01・jp_02・jp_05・jp_06 とハード＝12、seed 2 の us_03・jp_01・jp_02・jp_05＝4。SECS 既定 90）・dawn20（同じ 16 件を
// &dawn=20）・nodawn（同じ 16 件を &nostrike・SECS=200）・ptrun（jp_05 の seed 1・2 を全速で）・result（base の初めの 8 件を終わるまで回して Result の文も）＝58 件。
// 1 件だけ: MISSION=us_02 [HARD=1] [SEED=1] [DAWN=20] [NODAWN=1] [SECS=200] [PTRUN=1] [RESULT=1]。jp_04 の卯月を切った夜（B の &noally）と A を比べるのは NOALLY=1（MISSION=jp_04 の組）。
// v0.6.11 S6: SET=jp03 で jp_03（空襲下の退避）のノーマル・ハード × seed 1・2 を 260 秒（決着の 240 秒の後まで）。A は jp_03 の世界のあるビルド（88c9f19 には無いので S5 の ae6af75）。
//   all（88c9f19 と比べる 58 件）には入れない（元の件は今のまま）。jp_03 の写しは座席の自艇・HP・燃料・魚雷と HUD の文（隊の 18 隻は world-vs-sim が比べる）。
// v0.6.11 S8: SET=jp04base で jp_04（卯月あり）のノーマル・ハード × seed 1〜4 を 170 秒（A は 88c9f19。all には入れない）。
// v0.6.11 S8b: CAM=1 で写しにカメラ（scrollX・scrollY・zoom・followOffset）も足す（jp_03 の隠れ場所の中の見越し 0 がほかの任務のカメラを変えないことを見る。既定は今の写しのまま）。
// v0.8.0 S2（spec-v0800 §6 の S2・brief L9・L13）: SET=us04 で us_04（ブラケット海峡の夜。列の通過とレーダー）のノーマル・ハード × seed 1・2 を 260 秒（夜明けまで。all には入れない。
//   A は S2 の commit のビルド＝以後の段の回帰）。写しは隊の全艦（s.d。列の艦も）に列の段階（s.tr）とレーダーの輝点（s.rd: 掃引の回数・数・位置）を足す（無い任務は鍵ごと無い＝今の写しのまま）。
//   NOPLANE=1 で B だけ &noplane（v0.8.1 IP2: us_06 の水上機を切った夜が IP1 のビルドと同じ世界の証）。NORADAR=1 で B だけ &noradar（レーダーを切った夜。A と同じビルドで回せばレーダーが世界も HUD も変えない証＝L9 の (b)。レーダーの写し s.rd は比べない）。
// v0.8.0 S4（brief L33）: us_04 の HUD の S4 の物を比べから外す明示の濾し（S4_FILTER。tests/hud-ab-filter が固定）。RADARUI=1（A は S3 の commit のビルド・B は今の木）は B が、
//   NORADAR=1（A＝B＝今の木・B だけ &noradar）は A が「出し側」: 出し側を先に回し、2 行目が S4 の行（RADARUI は 4 つのレーダーの文と衝突の危険、NORADAR はレーダーの文だけ＝衝突の危険と
//   3 行目の「去った」は比べる）だったフレームの番号とその Text の添字を記録し、両方の側でそのフレームのその Text だけを '<S4>' に替える。緑の端の印（字の色 #6dff8c・絵の鍵 tex-radar-marker）は
//   両方の側で除く。世界の写し（自艇・艦・魚雷・列の段階・輝点）とほかの HUD の物はそのまま比べる。結果に隠したフレームの数（masked）。FILTERTEST=1 は濾しが別の変化を隠さない試し
//   （出し側でない側の、隠したフレームの 3 行目の字に 'X' を足す → 違いが出るはず）。
// v0.8.1 S2（spec-v0810 §6 の S2・brief の「新しい組」）: SET=us06 で us_06（オルモック湾の決着。止まった艦と暗い岸を背に）のノーマル・ハード × seed 1・2 を 200 秒（夜明けまで。all には入れない。
//   S2 は A＝B＝今の木で決定性を見る・S3 から A は S2 の commit のビルド＝以後の段の回帰）。写しに止まった艦の段（s.an: 段・anchored）を足す（無い任務は鍵ごと無い＝今の写しのまま）。
// v0.8.1 S4（brief L69）: ANCHORUI=1 は us_06 の S4 の新しい文の濾し（scripts/headless/anchor-filter。B が出し側・世界の写しは全部比べる。FILTERTEST=1 は濾しの試し）。
// v0.8.2 S2（spec-v0820 §8 の S2・brief L25）: SET=us05 で us_05（スリガオ海峡・最初の接触。片道の列・見張り・報告・弾薬庫）のノーマル・ハード × seed 1・2 を 270 秒（夜明けまで。all には入れない。
//   S2 は A＝B＝今の木で決定性とページのエラー・S2b から A は S2 の commit のビルド）。写しに報告の段（s.rc: 段・無線・追った秒・引いた回数）・列の見張り（s.sc: 離れている艦）・
//   弾薬庫（s.mg: 誘爆の数・引いた回数）を足す（無い任務は鍵ごと無い＝今の写しのまま）。
// v0.8.2 S4（lead の L48）: RECONUI=1 は us_05 の S4 の新しい文と中継の端の印の濾し（scripts/headless/recon-filter。B が出し側・世界の写しは全部比べる。A は S3 の commit のビルド）。
// v0.8.3: CTRLUI（既定 1）で両方の側の HUD の写しから「静音」「倍速」の丸と字（B にだけある 4 つの物＝lib.mjs の isCtrl）を除いて比べる（世界の写しは全部比べる）。
//   結果の行に両方の側で除いた数（ctrl A n B m。A＝基準 b7e9f44 は 0、B＝今の木は写すたびに 4）。CTRLUI=0 で除かない（違いが出るはず）。
// v0.8.4（煙幕への乱射。史実モードだけ）: SET=hist で史実モード（両方の側に &historical）の us_01・us_02・us_06 × seed 1・2 を 200 秒（&nostrike。台本は煙幕を張らない）＝乱射の系列を作っても
//   煙を使わない夜は基準と 1 ビットも同じ証。SET=histsmoke は同じ us_02 seed 1・2 で、最寄りの艦へ背を向けずに寄り、700 m の内に入ったら止まって煙幕を張り続ける台本（寄ってくる艦が 500 m の内に入る）（o.smoke）＝違いが出るはずの組（最初の違いを出す）。SET=smokeoff は同じ煙幕の台本を史実モードのオフで＝同じはずの組。
// v0.8.5 S2（spec-v0850 §5 の門 4）: SET=us07 で us_07（D-Day・生存者救助。救助・機雷原・210 mm の砲台・S ボート）のノーマル・ハード × seed 1・2 を 320 秒（救助の時間 300 秒の後まで。all には入れない。
//   S2 は A＝B＝今の木で決定性とページのエラー・S2 の後は A を S2 の commit のビルドに）。写しに救助（s.rs: 乗せている・渡した・砲撃で失った・他艦が拾った・群の残り）・機雷（見えた・爆発）・
//   フィッチの砲火（退いた数）・沿岸砲（撃った・命中）を足す（無い任務は鍵ごと無い＝今の写しのまま）。
// v0.9.0 S0: SET=custom で 13 任務 × ノーマル・ハード × seed 1 を両方の側に &custom=all（ストアの品を全部）で 120 秒（A＝B＝今の木＝決定性とページのエラー。all には入れない）。
// v0.9.0 IP1: SET=custom に史実モード × カスタム（米の 7 任務・set cuhist）と史実モードの煙幕の台本 × カスタム（us_02 seed 1・2・set cuhsmk＝大型煙幕と乱射）を足した＝35 件。
// 実行: A=<site A> B=<site B> [CTRLUI=0] [INPUT=primary|both|none] [SET=all|base|dawn20|nodawn|ptrun|result|jp04|jp04base|jp03|us04|us06|us05|us07|hist|histsmoke|smokeoff|custom] [CAM=1] [NORADAR=1] [RADARUI=1] [ANCHORUI=1] [RECONUI=1] [FILTERTEST=1] [JOBS=3] node scripts/headless/ab-replay.mjs
import { fileURLToPath } from 'node:url';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { anchorPair } from './anchor-filter.mjs';
import { reconPair } from './recon-filter.mjs';

/** S4 の濾し（brief L33。ページへは文字列で渡す）: 2 行目の S4 の行・そのうちレーダーだけの行・緑の端の印の字の色と絵の鍵・隠した物の字 */
export const S4_FILTER = {
  lineRe: '^(レーダー探知！ |レーダー: |接触が東（|衝突の危険！ )',
  radarOnlyRe: '^(レーダー探知！ |レーダー: |接触が東（)',
  green: '#6dff8c',
  tex: 'tex-radar-marker',
  mask: '<S4>',
};

/** ページの中: HUD の物を濾す（緑の印を除き、出し側は S4 の行を見つけて記録し、両方の側で記録した Text を mask に替える）。f は o.s4、k はフレームの番号 */
export function s4Hud(objs, f, k) {
  const out = objs.filter((x) => !(x.type === 'Text' && x.color === f.green) && x.tex !== f.tex);
  if (f.source) {
    const re = new RegExp(f.re);
    const i = out.findIndex((x) => x.type === 'Text' && re.test(x.text));
    if (i >= 0) f.marks[k] = i;
  }
  const at = f.marks[k];
  if (at !== undefined && out[at]) out[at] = { type: 'Text', text: f.mask };
  if (f.inject && at !== undefined) {
    // 濾しが別の変化を隠さない試し（FILTERTEST=1）: 隠したフレームの、隠していない Text（3 行目の「見つかる距離」の行）に 'X' を足す
    const j = out.findIndex((x, n) => n !== at && x.type === 'Text' && /見つかる距離|去った|撃沈/.test(x.text));
    if (j >= 0) out[j] = { ...out[j], text: `${out[j].text}X` };
  }
  return out;
}

/** ページの中: 1 夜を回してフレームごとの写しの指紋を返す（写しの文字列はページに残す＝最初の違いの取り出し用）。o.hudEvery があればその間隔のフレームだけ HUD の物を写す（hud-ab） */
export function abRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  const frames = [];
  const hashes = [];
  window.__ab = frames;
  const d2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
  const r6 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
  let lastTorp = -1;
  const snap = () => {
    const b = w.boat.state;
    const s = { t: r6(w.stepTimeS), b: [r6(b.x), r6(b.y), r6(b.headingDeg), r6(b.speedMps)], hp: r6(w.damage.hp), fire: r6(w.damage.fireLeftS), fuel: r6(w.fuel.gal), sink: w.boat.sinking, home: w.atHome };
    if (w.destroyers) s.d = w.destroyers.ships.map((x) => [r6(x.state.x), r6(x.state.y), r6(x.state.headingDeg), x.sinking, x.withdrawn, x.hitsTaken]);
    if (w.hunt) s.g = w.hunt.flotilla.barges.map((x) => [r6(x.x), r6(x.y), x.phase, r6(x.hp)]);
    if (w.pts) s.p = w.pts.section.boats.map((x) => [r6(x.x), r6(x.y), x.phase, r6(x.hp), x.fate]);
    if (w.convoy) s.c = [w.convoy.state.arrived, w.convoy.state.sunk, w.convoy.state.hitsTaken, w.convoy.state.barges.map((x) => [r6(x.x), r6(x.y)])];
    s.tp = w.torpedoes.states.map((x) => (x.active ? [r6(x.x), r6(x.y)] : 0));
    if (w.landing) s.l = [w.landing.state.phase, w.landing.state.hits, w.landing.pool.states.map((x) => (x.active ? [r6(x.x), r6(x.y)] : 0))];
    // 列の通過（v0.8.0 S2。us_04）の段階と、レーダーの輝点（NORADAR の比べでは写さない）。無い任務は鍵ごと無い
    if (w.destroyers && w.destroyers.transit) s.tr = Array.from(w.destroyers.transit.state.phase.slice(0, w.destroyers.transit.state.ships));
    if (w.radar && !o.noradar) s.rd = [w.radar.state.sweeps, w.radar.state.n, w.radar.state.blips.slice(0, w.radar.state.n).map((x) => [x.x, x.y])];
    // 止まった艦（v0.8.1 S2。us_06）の段と止まっているか。無い任務は鍵ごと無い
    if (w.destroyers && w.destroyers.anchors) s.an = [Array.from(w.destroyers.anchors.state.stage), w.destroyers.ships.map((x) => x.anchored)];
    // 報告・列の見張り・弾薬庫（v0.8.2 S2。us_05）。無い任務は鍵ごと無い
    if (w.recon) s.rc = [w.recon.state.stage, w.recon.state.radioBroken, r6(w.recon.state.trackedS), w.recon.state.draws];
    if (w.destroyers && w.destroyers.roles) s.sc = Array.from(w.destroyers.roles.st.away);
    if (w.destroyers && w.destroyers.magazine) s.mg = [w.destroyers.magazine.detonations, w.destroyers.magazine.draws];
    // 救助・機雷・フィッチの砲火・大発の無い任務の沿岸砲（v0.8.5 S2。us_07）。無い任務は鍵ごと無い
    if (w.rescue) { const st = w.rescue.state; s.rs = [st.aboard, st.delivered, st.lostShell, st.byOthers, Array.from(st.left), w.rescue.mines ? [w.rescue.mines.seen, w.rescue.mines.blown] : 0, w.rescue.cover ? w.rescue.cover.count : 0]; }
    if (w.shoreGuns) s.sg = [w.shoreGuns.shoreShots, w.shoreGuns.shoreHits];
    s.hud = o.s4 ? window.__s4Hud(hl.objects('Hud'), o.s4, frames.length).filter((x) => x.type === 'Text').map((x) => x.text) : hl.texts('Hud');
    if (o.cam) {
      // カメラ（v0.6.11 S8b の CAM=1: jp_03 だけ隠れ場所の中で見越しを 0 にした＝ほかの任務のカメラが同じかを見る）
      const m = hl.mission();
      const cam = m && m.cameras ? m.cameras.main : null; // 任務が終わったフレームは無い
      s.cam = cam ? [r6(cam.scrollX), r6(cam.scrollY), r6(cam.zoom), r6(cam.followOffset.x), r6(cam.followOffset.y)] : null;
    }
    return JSON.stringify(s);
  };
  const end = Math.round(o.secs * 60);
  for (let k = 0; k < end; k++) {
    if (!hl.active('Mission')) break;
    const t = w.stepTimeS;
    const b = w.boat.state;
    const f = w.enemy.focus(b.x, b.y);
    const dist = f ? Math.sqrt(d2(f, b)) : Infinity;
    if (t < 2) hl.steer(NaN, 0);
    else if (o.smoke && f && (dist < 700 || w.smoke.puffs.some((p) => p.active))) { hl.steer(NaN, 0); w.input.smokeTap = true; } // v0.8.4 の histsmoke: 700 m の内（か煙が残る間）は止まって煙幕を張り続ける（張れる時だけ張れる。寄ってくる艦が 500 m の内に入る）
    else if (o.smoke && f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), 0.6); // それまでは背を向けずに寄る
    else if (f && dist < 600) hl.steer(hl.bearing(f.x, f.y, b.x, b.y), o.ptrun ? 1 : 0.8);
    else if (f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), o.ptrun ? 1 : dist > 1800 ? 0.6 : 0.4);
    else hl.steer((90 + t * 2) % 360, 0.5);
    const main = w.setup.mainWeapon;
    const torp = o.input !== 'none' && (main === 'torpedo' || o.input === 'both');
    const gun = o.input !== 'none' && (main === 'guns' || o.input === 'both');
    const slot = Math.floor(t / 12);
    if (torp && t > 8 && slot !== lastTorp && dist < 2500) { w.input.fireTap = true; lastTorp = slot; }
    w.input.gunHeld = gun && t % 8 < 3 && dist < 1500;
    hl.frame(o.frameMs);
    if (o.hudEvery && (k + 1) % o.hudEvery !== 0) continue;
    const sn = o.hudEvery ? JSON.stringify({ t: r6(w.stepTimeS), hud: o.s4 ? window.__s4Hud(hl.objects('Hud'), o.s4, frames.length) : hl.objects('Hud') }) : snap();
    frames.push(sn);
    hashes.push(hl.fnv(sn));
  }
  let result = null;
  if (o.result) {
    for (let i = 0; i < 60 * 30 && hl.active('Mission'); i++) { hl.steer(NaN, 0); hl.frame(o.frameMs); }
    for (let i = 0; i < 30; i++) hl.frame(o.frameMs);
    result = hl.active('Result') ? hl.texts('Result') : ['(Result なし)'];
    hashes.push(hl.fnv(JSON.stringify(result)));
    frames.push(JSON.stringify(result));
  }
  return { hashes, result, marks: o.s4 ? o.s4.marks : null };
}

/** 2 つの写し（JSON の文字列）の最初に違う欄 */
export function firstField(a, b) {
  const A = JSON.parse(a);
  const B = JSON.parse(b);
  const walk = (x, y, p) => {
    if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) return JSON.stringify(x) === JSON.stringify(y) ? null : { path: p, a: x, b: y };
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      const r = walk(x[k], y[k], `${p}.${k}`);
      if (r) return r;
    }
    return null;
  };
  return walk(A, B, '');
}

export function abCases(set, input) {
  const V = [['us_01', 0], ['us_01', 1], ['us_02', 0], ['us_02', 1], ['us_03', 0], ['us_03', 1], ['jp_01', 0], ['jp_01', 1], ['jp_02', 0], ['jp_05', 0], ['jp_06', 0], ['jp_06', 1]].map(([m, h]) => ({ mission: m, hard: h === 1, seed: 1 }));
  for (const m of ['us_03', 'jp_01', 'jp_02', 'jp_05']) V.push({ mission: m, hard: false, seed: 2 });
  const base = { input, secs: envNum('SECS', 90), dawn: 0, nodawn: false, ptrun: false, result: false, noally: false, cam: process.env.CAM === '1', noradar: process.env.NORADAR === '1', radarui: process.env.RADARUI === '1', anchorui: process.env.ANCHORUI === '1', reconui: process.env.RECONUI === '1', filtertest: process.env.FILTERTEST === '1', ...(process.env.NOPLANE === '1' ? { noplane: true } : {}) };
  const sets = {
    base: () => V.map((v) => ({ ...base, ...v, set: 'base' })),
    dawn20: () => V.map((v) => ({ ...base, ...v, dawn: 20, set: 'dawn20' })),
    nodawn: () => V.map((v) => ({ ...base, ...v, nodawn: true, secs: envNum('SECS', 200), set: 'nodawn' })),
    ptrun: () => [1, 2].map((seed) => ({ ...base, mission: 'jp_05', hard: false, seed, ptrun: true, set: 'ptrun' })),
    result: () => V.slice(0, 8).map((v) => ({ ...base, ...v, secs: envNum('SECS', 200), result: true, set: 'result' })),
    // jp_04 の卯月を切った夜（B は &noally）と A（6856840）: ノーマル・ハード × seed 1〜4（G6w。S5b の門）
    jp04: () => [false, true].flatMap((hard) => [1, 2, 3, 4].map((seed) => ({ ...base, mission: 'jp_04', hard, seed, secs: envNum('SECS', 170), noally: true, set: 'jp04' }))),
    // jp_04 の卯月のいる夜を 88c9f19（v0.6.10）と比べる（v0.6.11 S8。ほかの 8 任務のビット同一の jp_04 の分。B に &noally は付けない）: ノーマル・ハード × seed 1〜4
    jp04base: () => [false, true].flatMap((hard) => [1, 2, 3, 4].map((seed) => ({ ...base, mission: 'jp_04', hard, seed, secs: envNum('SECS', 170), set: 'jp04base' }))),
    // jp_03 の空襲下の退避（v0.6.11 S6。Title に出た版）: 決着の 240 秒の後まで。A は S5（ae6af75）のビルド
    jp03: () => [false, true].flatMap((hard) => [1, 2].map((seed) => ({ ...base, mission: 'jp_03', hard, seed, secs: envNum('SECS', 260), set: 'jp03' }))),
    // us_04 のブラケット海峡の夜（v0.8.0 S2。列の通過とレーダー）: 夜明けの 260 秒まで。A は S2 の commit のビルド（以後の段の回帰）。NORADAR=1 なら B だけレーダーを切る
    us04: () => [false, true].flatMap((hard) => [1, 2].map((seed) => ({ ...base, mission: 'us_04', hard, seed, secs: envNum('SECS', 260), set: 'us04' }))),
    // us_06 のオルモック湾の決着（v0.8.1 S2。止まった艦と暗い岸を背に）: 夜明けの 200 秒まで。S2 は A＝B＝今の木（決定性）・S3 から A は S2 の commit のビルド
    us06: () => [false, true].flatMap((hard) => [1, 2].map((seed) => ({ ...base, mission: 'us_06', hard, seed, secs: envNum('SECS', 200), set: 'us06' }))),
    // us_05 のスリガオ海峡・最初の接触（v0.8.2 S2。片道の列・見張り・報告・弾薬庫）: 夜明けの 270 秒まで。S2 は A＝B＝今の木（決定性）・S2b から A は S2 の commit のビルド
    us05: () => [false, true].flatMap((hard) => [1, 2].map((seed) => ({ ...base, mission: 'us_05', hard, seed, secs: envNum('SECS', 270), set: 'us05' }))),
    // us_07 の D-Day・生存者救助（v0.8.5 S2）: 救助の時間 300 秒の後まで 320 秒。S2 は A＝B＝今の木（決定性）・S2 の後は A を S2 の commit のビルドに
    us07: () => [false, true].flatMap((hard) => [1, 2].map((seed) => ({ ...base, mission: 'us_07', hard, seed, secs: envNum('SECS', 320), set: 'us07' }))),
    // 史実モード（v0.8.4）: 煙を使わない夜は基準と同じ（hist）・止まって煙幕を張る夜は違う（histsmoke）
    hist: () => ['us_01', 'us_02', 'us_06'].flatMap((mission) => [1, 2].map((seed) => ({ ...base, mission, hard: false, seed, nodawn: true, historical: true, secs: envNum('SECS', 200), set: 'hist' }))),
    histsmoke: () => [1, 2].map((seed) => ({ ...base, input: 'none', mission: 'us_02', hard: false, seed, nodawn: true, historical: true, smoke: true, secs: envNum('SECS', 200), set: 'histsm' })),
    // 同じ煙幕の台本を史実モードのオフで（v0.8.4）: 乱射は作らない＝基準と同じはず
    smokeoff: () => [1, 2].map((seed) => ({ ...base, input: 'none', mission: 'us_02', hard: false, seed, nodawn: true, smoke: true, secs: envNum('SECS', 200), set: 'smkoff' })),
    // カスタムの装備（v0.9.0 S0。両方の側に &custom=all＝ストアの品を全部。A＝B＝今の木で決定性とページのエラー 0）: 13 任務 × ノーマル・ハード × seed 1
    // v0.9.0 IP1（史実モードでもカスタム）: 米の 7 任務 × 史実モード × カスタム（set cuhist。日本の艇に品は無い）と、史実モードの煙幕の台本（histsmoke と同じ）にカスタム＝大型煙幕と煙幕への乱射が重なる夜 2 つ
    custom: () => [
      ...['us_01', 'us_02', 'us_03', 'us_04', 'us_05', 'us_06', 'us_07', 'jp_01', 'jp_02', 'jp_03', 'jp_04', 'jp_05', 'jp_06'].flatMap((mission) => [false, true].map((hard) => ({ ...base, mission, hard, seed: 1, custom: 'all', secs: envNum('SECS', 120), set: 'custom' }))),
      ...['us_01', 'us_02', 'us_03', 'us_04', 'us_05', 'us_06', 'us_07'].map((mission) => ({ ...base, mission, hard: false, seed: 1, custom: 'all', historical: true, secs: envNum('SECS', 120), set: 'cuhist' })),
      ...[1, 2].map((seed) => ({ ...base, input: 'none', mission: 'us_02', hard: false, seed, nodawn: true, historical: true, smoke: true, custom: 'all', secs: envNum('SECS', 200), set: 'cuhsmk' })),
    ],
  };
  if (process.env.MISSION) {
    return [{ ...base, mission: process.env.MISSION, hard: process.env.HARD === '1', seed: envNum('SEED', 1), dawn: envNum('DAWN', 0), nodawn: process.env.NODAWN === '1', ptrun: process.env.PTRUN === '1', result: process.env.RESULT === '1', noally: process.env.NOALLY === '1', secs: envNum('SECS', 90), set: 'one' }];
  }
  return set === 'all' ? [...sets.base(), ...sets.dawn20(), ...sets.nodawn(), ...sets.ptrun(), ...sets.result()] : sets[set]();
}

export function query(c, side) {
  return `mission=${c.mission}&seed=${c.seed}${c.custom ? `&custom=${c.custom}` : ''}${c.historical ? '&historical' : ''}${c.hard ? '&hard' : ''}${c.dawn ? `&dawn=${c.dawn}` : ''}${c.nodawn ? '&nostrike' : ''}${c.noally && side === 'B' ? '&noally' : ''}${c.noradar && side === 'B' ? '&noradar' : ''}${c.noplane && side === 'B' ? '&noplane' : ''}`;
}

/** S4 の濾しの設定（RADARUI は B・NORADAR は A が出し側。どちらでもなければ null＝今のまま） */
function s4Of(c, side) {
  if (!c.radarui && !c.noradar) return null;
  const src = c.radarui ? 'B' : 'A';
  return { ...S4_FILTER, re: c.radarui ? S4_FILTER.lineRe : S4_FILTER.radarOnlyRe, source: side === src, marks: {}, inject: c.filtertest === true && side !== src };
}

export async function oneCase(browser, A, B, c) {
  const pa = await openGame(browser, A, query(c, 'A'), { width: envNum('W', 1560) });
  const pb = await openGame(browser, B, query(c, 'B'), { width: envNum('W', 1560) });
  try {
    const ctrl = process.env.CTRLUI !== '0';
    for (const p of [pa, pb]) await p.page.evaluate((on) => { window.__hl.ctrlDrop = on; window.__hl.ctrlDropped = 0; }, ctrl);
    const o = { ...c, frameMs: FRAME_MS, hudEvery: c.hudEvery ?? 0 };
    let ra;
    let rb;
    if (c.anchorui) [ra, rb] = await anchorPair(pa, pb, o, c, abRun); // us_06 の S4 の濾し（v0.8.1 S4。anchor-filter）
    else if (c.reconui) [ra, rb] = await reconPair(pa, pb, o, c, abRun); // us_05 の S4 の濾し（v0.8.2 S4。recon-filter）
    else if (c.radarui || c.noradar) {
      // S4 の濾し: 出し側を先に回してフレームの印を集め、もう一方へ渡す
      for (const p of [pa, pb]) await p.page.evaluate(`window.__s4Hud = ${s4Hud.toString()}`);
      const first = c.radarui ? pb : pa;
      const second = c.radarui ? pa : pb;
      const r1 = await first.page.evaluate(abRun, { ...o, s4: s4Of(c, c.radarui ? 'B' : 'A') });
      const r2 = await second.page.evaluate(abRun, { ...o, s4: { ...s4Of(c, c.radarui ? 'A' : 'B'), marks: r1.marks } });
      [ra, rb] = c.radarui ? [r2, r1] : [r1, r2];
      c.masked = Object.keys(r1.marks).length;
    } else [ra, rb] = await Promise.all([pa.page.evaluate(abRun, o), pb.page.evaluate(abRun, o)]);
    const n = Math.min(ra.hashes.length, rb.hashes.length);
    let at = -1;
    for (let i = 0; i < n; i++) if (ra.hashes[i] !== rb.hashes[i]) { at = i; break; }
    if (at < 0 && ra.hashes.length !== rb.hashes.length) at = n;
    const errors = [...pa.errors.map((e) => `A: ${e}`), ...pb.errors.map((e) => `B: ${e}`)];
    if (ctrl) c.ctrl = await Promise.all([pa, pb].map((p) => p.page.evaluate(() => window.__hl.ctrlDropped)));
    if (at < 0) return { ...c, same: errors.length === 0, frames: n, errors };
    const [sa, sb] = await Promise.all([pa.page.evaluate((i) => window.__ab[i] ?? null, at), pb.page.evaluate((i) => window.__ab[i] ?? null, at)]);
    return { ...c, same: false, frames: n, at, field: sa && sb ? firstField(sa, sb) : { path: '(長さ)', a: ra.hashes.length, b: rb.hashes.length }, errors };
  } finally {
    await pa.ctx.close();
    await pb.ctx.close();
  }
}

async function main() {
  if (!process.env.A || !process.env.B) throw new Error('A=<基準の site> B=<今の site> が要る');
  const cases = abCases(process.env.SET ?? 'all', process.env.INPUT ?? 'primary');
  const sa = await serve(process.env.A);
  const sb = await serve(process.env.B);
  const browser = await chromium.launch();
  const res = await pool(cases, envNum('JOBS', 3), (c) => oneCase(browser, sa.base, sb.base, c));
  await browser.close();
  await sa.close();
  await sb.close();
  let bad = 0;
  for (const r of res) {
    const tag = `${r.set.padEnd(6)} ${r.mission}${r.hard ? '&hard' : ''} seed ${r.seed}${r.dawn ? ` dawn ${r.dawn}` : ''}${r.nodawn ? ' nostrike' : ''}${r.ptrun ? ' ptrun' : ''}${r.result ? ' result' : ''}${r.noally ? ' B&noally' : ''}${r.noradar ? ' B&noradar' : ''}${r.noplane ? ' B&noplane' : ''}${r.historical ? ' historical' : ''}${r.smoke ? ' smoke' : ''}${r.radarui ? ' RADARUI' : ''}${r.anchorui ? ' ANCHORUI' : ''}${r.reconui ? ' RECONUI' : ''}${r.filtertest ? ' FILTERTEST' : ''}${r.masked !== undefined ? ` masked ${r.masked}` : ''}${r.ctrl ? ` ctrl A ${r.ctrl[0]} B ${r.ctrl[1]}` : ''}`;
    if (!r.same) bad++;
    console.log(`${tag} same:${r.same} frames ${r.frames}${r.same ? '' : ` 最初の違い frame ${r.at} ${JSON.stringify(r.field)}`}${r.errors.length ? ` page errors ${r.errors.length}: ${r.errors[0]}` : ''}`);
  }
  console.log(`cases ${res.length} same ${res.length - bad} diff ${bad}`);
  process.exitCode = bad === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
