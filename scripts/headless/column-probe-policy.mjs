// us_05「スリガオ海峡・最初の接触」の探りの台本（v0.8.2 S3。spec-v0820 §6 D-P2・D-P3、lead の L29）。素の JS: src を読み込まない・ゲームの乱数も JS の既定の乱数も使わない・世界の物を受け取らない。
// 読むのは scripts/headless/column-probe.mjs のページの糊が毎フレーム書く素の見え方（view）だけ＝人が画面と Briefing で知れる物: 地図（出発点・帰投の輪・中継の輪）・レーダーの輝点（位置と掃引の秒。
// 種類は出ない）・目で見える艦（視程の内の位置・絵の種類＝駆逐艦／重巡／戦艦・目で見た位置の差から出した速さ）・HUD（発見された・照らされている・魚雷の残り・輪の中・夜明けまで・
// 報告の段＝S4 の 2 行目の常の文「戦艦を目で確かめよ」「追尾 N 秒」「報告済み」「無線故障 ・ 中継」が言う物）。書くのは素の出力（針路・速さ・撃つ本数と扇の開き角・煙幕のボタン）だけ（tests/column-probe-scan）。
// 人の揺らぎ（反応 0.5〜2 秒・狙い ±2°・止まる点の揺らぎ）はこの台本だけの乱数（seed × 7907 ＋ 40483 の mulberry32。ゲームの seed〜seed+45 の系列と重ならない＝v0.8.1 の探りと同じ足し算）。
// 輝点の組: 掃引ごとに輝点を x で並べ、x の間が gapM（1,000 m）を超える所で組に分ける。最初に見た組が前衛、2 つ目の組（西に現れた組）が本隊（以後は前の位置に近い組を追う）。
// 台本（spec の D-P3。止まる点は輝点の組から: 本隊の道＝本隊の輝点の最も南の y、時雨の道＝最も北の y）:
//   shadow_report 巡航で待つ点（出発点の西 1,000〜1,400 m・南 200〜400 m）へ → 本隊が見えたら道の北 1,300〜1,500 m（時雨の道から 700 m 以上北）へ静音で直して止まる → 報告を待つ
//                 → 送れば北東の輪へ（中継待ちなら西の中継の輪 → 北東の輪）。報告の前に見つかれば輪へ逃げる。本隊が東へ過ぎても確かめられなければ帰る
//   report_attack shadow_report の後（報告がまとまったら）、見えている戦艦へ止まったまま 4 本（1,400 m の内か遠ざかり始めたら）→ shadow と同じ慎重な帰り方で輪へ（中継待ちなら中継の輪。S3b・lead の L38）
//   bb_ambush     列が来る前に出発点の真南（前衛の道の南 900 m・南の縁の内 300 m まで）へ巡航で渡って止まり、本隊が見えたら戦艦の道の南 900〜1,100 m（見張りの道の反対の側。S3b・lead の L38）へ
//                 静音で直して（輝点か見える艦が 1,500 m の内なら止まって待つ）、報告を待たずに戦艦へ 4 本（1,250 m の内か遠ざかり始め）→ 列を横切らず西へ全速で 2,200 m 離れ、慎重な帰り方で輪へ（中継待ちなら中継の輪）
//   van_attack    前衛の道の北 1,000 m（出発点の西 400〜800 m）に静音で止まり、前衛の艦（駆逐艦か重巡）へ 4 本（1,050 m の内か遠ざかり始め）→ shadow_report と同じ点へ静音 → 報告 → 帰る
//   charge        全速で最寄りの輝点へ、目で見える艦が 900 m の内なら全速のまま 4 本 → 全速で輪へ
//   radar_only    北の岸沿い（出発点の真北 y 300）に巡航で回って止まり、輝点を見るだけ（どの艦にも寄らない＝戦艦を目で見ない）→ 本隊の輝点が消えるか夜明けの 60 秒前に帰る
//   idle          出発点で止まったまま（漂流の確かめ）
// 帰り方: 発見された・照らされている間（反応の後。照らされていれば煙幕のボタンも＝charge は押さない）と charge の撃った後は全速（bb_ambush は撃った後、列から 2,200 m 離れるまで西へ全速）、ほかは輝点か目で見える艦が 1,500 m の内なら止まって過ぎるのを待ち、2,200 m の内は静音、外は巡航。
// 報告を送る前に見つかれば（追尾はレーダーで続く）輪へ逃げる。報告の追尾の間（段 1）は帰投の輪の外 200 m で待つ（輪に入ると任務が終わる）。夜明けの 60 秒前になれば帰る（中継待ちなら中継の輪を先に）。確保は作る時だけ。

export const COLUMN_POLICIES = ['shadow_report', 'report_attack', 'bb_ambush', 'van_attack', 'charge', 'radar_only', 'idle'];
export const COLUMN_HARD_POLICIES = ['shadow_report', 'report_attack'];
/** 台本の目安（design。ゲームの強さの値ではない）: 乱数・反応の秒・狙いの ±度と許し・着いた m・扇の 1 本の秒・止まって見える速さの 2 乗・静音の比・組の間・待つ点・本隊との間・時雨の道との間・
 *  待ち伏せの間・前衛との間・撃つ m・縁・夜明けの前の帰る秒・輪の外で待つ m・北の岸の y・見失って諦める秒・帰る時に止まって待つ m と静音の m・bb_ambush が本隊を待つ前衛の道の南の m */
export const COLUMN_HUMAN = { seedMul: 7907, seedAdd: 40483, reactS: [0.5, 2], aimDeg: 2, aimTolDeg: 1.5, arriveM: 40, holdS: 0.4, still2: 0.25, silentFrac: 0.95, gapM: 1000,
  stageDx: [1000, 1400], stageDy: [200, 400], shadowM: [1300, 1500], screenM: 700, ambushM: [900, 1100], vanM: 1000, vanDx: [400, 800], reportFireM: 1400, ambushFireM: 1250, vanFireM: 1050, chargeM: 900,
  edgeM: 300, dawnHomeS: 60, ringWaitM: 200, northY: 300, lostS: 10, holdM: 1500, quietM: 2200, southM: 900 };
const H = COLUMN_HUMAN, CAP = 16, DD = 0, CA = 1, BB = 2, ANY = -1;
const REP_NONE = 0, REP_TRACK = 1, REP_SENT = 2, REP_PENDING = 3, REP_RELAYED = 4; // 報告の段（HUD の 2 行目の常の文が言う物）
const GO = 0, STOP = 1, AIM = 2, HOLD = 3, HOME = 4; // 段（GO＝点へ向かい着いたら止まって待つ）

/** 台本だけの乱数（mulberry32。0 以上 1 未満） */
function nextRand(d) {
  d.rs = (d.rs + 0x6d2b79f5) >>> 0;
  let z = d.rs;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
}
const range = (d, ab) => ab[0] + (ab[1] - ab[0]) * nextRand(d);
const wrap360 = (a) => ((a % 360) + 360) % 360;
const wrap180 = (a) => wrap360(a + 180) - 180;
const bearing = (x, y, tx, ty) => wrap360((Math.atan2(tx - x, -(ty - y)) * 180) / Math.PI);
const dist2 = (x, y, tx, ty) => (tx - x) * (tx - x) + (ty - y) * (ty - y);
const newGroup = () => ({ n: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 });

/** plan: 地図と艇の知れる値（糊が作る時に 1 回）。止まる点の揺らぎは作る時に引く（引く回数は台本で同じ＝夜の乱数の並びが台本の分岐に依らない） */
export function createColumnDriver(policy, seed, plan) {
  if (!COLUMN_POLICIES.includes(policy)) throw new Error(`知らない台本 ${policy}`);
  const d = { policy, plan, rs: (seed * H.seedMul + H.seedAdd) >>> 0, mode: GO, sweep: NaN, ord: new Int8Array(CAP), gs: [newGroup(), newGroup(), newGroup()], ng: 0,
    van: newGroup(), vanSeen: false, main: newGroup(), mainSeen: false, mainLastS: NaN, tx: NaN, ty: NaN, fired: false, quit: false, shot: 0, aimKind: ANY, actAt: NaN, err: 0, holdH: 0, holdUntil: 0,
    alarmAt: NaN, prevR2: Infinity, lostAt: NaN, dx: 0, dy: 0, offM: 0, vanDx: 0 };
  d.dx = range(d, H.stageDx); d.dy = range(d, H.stageDy); d.offM = range(d, policy === 'bb_ambush' ? H.ambushM : H.shadowM); d.vanDx = range(d, H.vanDx);
  d.tx = plan.startX - d.dx; d.ty = plan.startY + d.dy;
  if (policy === 'radar_only') { d.tx = plan.startX; d.ty = H.northY; }
  if (policy === 'van_attack') { d.tx = plan.startX - d.vanDx; d.ty = plan.startY; }
  if (policy === 'bb_ambush') { d.tx = plan.startX; d.ty = plan.height - H.edgeM; } // 列が来る前に出発点の真南へ（前衛の道の南 900 m の所で待ち、本隊が見えたら戦艦の道の南 900〜1,100 m へ）
  if (policy === 'idle') d.mode = STOP;
  return d;
}

/** 掃引ごとに輝点を組に分ける（x の大きい順＝東から。間が gapM を超えたら次の組。3 組まで）。前衛＝最初に見た組・本隊＝西に 2 つ目が現れた組（以後は前の位置に近い組） */
function readGroups(d, v) {
  if (v.bn === 0 || v.sweepS === d.sweep) return;
  d.sweep = v.sweepS;
  const o = d.ord;
  for (let k = 0; k < v.bn; k++) { let j = k; while (j > 0 && v.bx[o[j - 1]] < v.bx[k]) { o[j] = o[j - 1]; j--; } o[j] = k; }
  d.ng = 0;
  for (let k = 0; k < v.bn; k++) {
    const i = o[k], x = v.bx[i], y = v.by[i];
    if (k === 0 || v.bx[o[k - 1]] - x > H.gapM) { if (d.ng === d.gs.length) break; const g = d.gs[d.ng++]; g.n = 0; g.minX = g.maxX = x; g.minY = g.maxY = y; }
    const g = d.gs[d.ng - 1]; g.n++; g.minX = Math.min(g.minX, x); g.maxX = Math.max(g.maxX, x); g.minY = Math.min(g.minY, y); g.maxY = Math.max(g.maxY, y);
  }
  if (!d.vanSeen) { d.vanSeen = true; Object.assign(d.van, d.gs[0]); return; }
  let best = -1;
  if (!d.mainSeen) { if (d.ng >= 2) best = d.ng - 1; }
  else { let bd = Infinity; for (let k = 0; k < d.ng; k++) { const q = Math.abs(d.gs[k].minX - d.main.minX); if (q < bd) { bd = q; best = k; } } }
  if (best < 0) return;
  d.mainSeen = true; d.mainLastS = v.t; Object.assign(d.main, d.gs[best]);
}

/** 目で見えている艦のうち種類 kind（ANY はどれでも）の最寄りの添字（無ければ −1）と 2 乗の距離 */
function nearestSeen(v, kind) {
  let best = -1, bd = Infinity;
  for (let j = 0; j < v.en; j++) if (kind === ANY || v.ekind[j] === kind) { const q = dist2(v.x, v.y, v.ex[j], v.ey[j]); if (q < bd) { bd = q; best = j; } }
  return best;
}

/** 魚雷の針路（止まって見える艦はその方位、動く艦は見越し＝|D + V t| = s t の最も早い正の t。解けなければ方位） */
function aimAt(v, s, j) {
  const ex = v.ex[j], ey = v.ey[j], vx = v.evx[j], vy = v.evy[j], vv = vx * vx + vy * vy;
  if (vv < H.still2) return bearing(v.x, v.y, ex, ey);
  const dx = ex - v.x, dy = ey - v.y, a = vv - s * s, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
  let t = NaN;
  if (Math.abs(a) < 1e-9) t = b < 0 ? -c / b : NaN;
  else { const disc = b * b - 4 * a * c; if (disc >= 0) { const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a); t = r1 > 0 && (r1 < r2 || r2 <= 0) ? r1 : r2 > 0 ? r2 : NaN; } }
  return t > 0 ? bearing(v.x, v.y, ex + vx * t, ey + vy * t) : bearing(v.x, v.y, ex, ey);
}

/** 本隊の輝点から止まる点の y（本隊の道の北 offM・時雨の道から screenM 以上北。bb_ambush は戦艦の道の南 offM）。本隊の輝点が 2 つ未満なら直さない */
function mainStopY(d) {
  const m = d.main, south = d.plan.height - H.edgeM;
  if (d.policy === 'bb_ambush') return d.mainSeen && m.n >= 2 ? Math.min(south, m.maxY + d.offM) : d.vanSeen ? Math.min(south, d.van.maxY + H.southM) : d.ty; // 戦艦の道の南（見張りの道の反対の側）
  if (!d.mainSeen || m.n < 2) return d.ty;
  return Math.max(H.northY, Math.min(m.maxY - d.offM, m.minY - H.screenM));
}

/** 撃つ艦の種類と撃つ m（台本ごと。撃たない台本と撃ち終えた後は null） */
function shootPlan(d, v) {
  if (d.fired || d.quit || v.torps <= 0) return null;
  if (d.policy === 'report_attack') return v.rep >= REP_SENT ? [BB, H.reportFireM] : null;
  if (d.policy === 'bb_ambush') return [BB, H.ambushFireM];
  if (d.policy === 'van_attack') return [ANY, H.vanFireM];
  if (d.policy === 'charge') return [ANY, H.chargeM];
  return null;
}

/** 1 フレームの台本（固定ステップの前）。o に針路（NaN は保つ）・速さ（全速の比）・撃つ本数と扇の開き角を書く */
export function stepColumnDriver(d, v, o) {
  const p = d.plan;
  o.headingDeg = NaN; o.speed01 = 0; o.fireN = 0; o.fireSpreadDeg = 0; o.smoke = false;
  readGroups(d, v);
  if (d.policy === 'idle' || v.atHome) return;
  if (v.seen || v.lit) { if (Number.isNaN(d.alarmAt)) d.alarmAt = v.t + range(d, H.reactS); } else d.alarmAt = NaN;
  const run = !Number.isNaN(d.alarmAt) && v.t >= d.alarmAt;
  if (run && v.lit && d.policy !== 'charge') o.smoke = true; // 照らされたら（反応の後）煙幕のボタン（使えない間の押しはゲームが捨てる）
  if (d.mode === AIM) { aim(d, v, o); return; }
  if (d.mode === HOLD) { o.headingDeg = d.holdH; o.speed01 = d.policy === 'charge' ? 1 : 0; if (v.t >= d.holdUntil) afterShot(d); return; }
  // 帰る段へ: 夜明けの前・報告の後（撃つ台本は撃つ前なら残る）・確かめる前に見つかった（shadow の 2 つ）・本隊が過ぎて確かめられない・radar_only は本隊の輝点が消えた
  if (d.mode !== HOME) {
    const sp = shootPlan(d, v), late = v.leftS <= H.dawnHomeS;
    const passed = d.mainSeen && d.main.minX > v.x + H.gapM && v.rep === REP_NONE && v.t - d.mainLastS < 4;
    const gone = d.policy === 'radar_only' && d.mainSeen && v.t - d.mainLastS > H.lostS;
    const shadow = d.policy === 'shadow_report' || (d.policy === 'report_attack' && v.rep < REP_SENT) || (d.policy === 'van_attack' && d.fired);
    if (late || gone || (shadow && run && v.rep <= REP_TRACK) || (passed && sp === null) || (sp === null && v.rep >= REP_SENT && d.policy !== 'radar_only')) d.mode = HOME;
    else if (sp !== null) {
      const j = nearestSeen(v, sp[0]), r2 = j >= 0 ? dist2(v.x, v.y, v.ex[j], v.ey[j]) : Infinity;
      if (j >= 0) { d.lostAt = NaN; if (r2 <= sp[1] * sp[1] || (r2 > d.prevR2 && d.policy !== 'charge')) { d.mode = AIM; d.aimKind = sp[0]; d.actAt = v.t + range(d, H.reactS); d.err = range(d, [-H.aimDeg, H.aimDeg]); d.prevR2 = Infinity; aim(d, v, o); return; } }
      else if (Number.isNaN(d.lostAt)) d.lostAt = v.t;
      // 諦める: 報告の後に戦艦が lostS 見えない（report_attack）・本隊が東へ過ぎた（bb_ambush）
      if ((d.policy === 'report_attack' && j < 0 && v.t - d.lostAt > H.lostS) || (d.policy === 'bb_ambush' && d.mainSeen && d.main.minX > v.x + H.gapM)) { d.quit = true; d.mode = HOME; home(d, v, o, run); return; }
      d.prevR2 = r2;
      if (d.policy === 'charge') { const k = nearestBlip(v); if (k >= 0) { o.headingDeg = bearing(v.x, v.y, v.bx[k], v.by[k]); o.speed01 = 1; } return; }
    }
  }
  if (d.mode === HOME) { home(d, v, o, run); return; }
  // 点へ向かう・止まって待つ（本隊が見えたら点の y を直す。van_attack は撃つまで前衛の道の北 vanM）
  if (d.policy === 'van_attack' && !d.fired && d.vanSeen) d.ty = Math.max(H.northY, d.van.minY - H.vanM);
  else if (d.policy !== 'radar_only' && (d.policy !== 'van_attack' || d.fired)) d.ty = mainStopY(d);
  const far = dist2(v.x, v.y, d.tx, d.ty) > H.arriveM * H.arriveM;
  d.mode = far ? GO : STOP;
  if (far) { o.headingDeg = bearing(v.x, v.y, d.tx, d.ty); o.speed01 = run ? 1 : d.mainSeen || (d.policy === 'van_attack' && v.t > 1) ? p.silent01 : p.cruise01; }
  if (far && !run && d.policy === 'bb_ambush' && d.mainSeen && nearestQ(v) <= H.holdM * H.holdM) o.speed01 = 0; // 南で点を直す時は輝点か見える艦が 1,500 m の内なら止まって待つ
}

/** 撃った後: van_attack は shadow の点へ（静音）、ほかは輪へ（全速） */
function afterShot(d) {
  d.fired = true;
  if (d.policy === 'van_attack') { d.mode = GO; d.tx = d.plan.startX - d.dx; d.ty = d.plan.startY + d.dy; return; }
  d.mode = HOME;
}

/** 最寄りの輝点の添字（無ければ −1） */
function nearestBlip(v) {
  let best = -1, bd = Infinity;
  for (let k = 0; k < v.bn; k++) { const q = dist2(v.x, v.y, v.bx[k], v.by[k]); if (q < bd) { bd = q; best = k; } }
  return best;
}

/** 狙う段: 反応の後に狙いのずれ込みの針路へ向き、向けば扇を撃って構えたまま扇の秒だけ待つ。見失えば元の段へ */
function aim(d, v, o) {
  const p = d.plan, j = nearestSeen(v, d.aimKind);
  if (j < 0) { d.mode = GO; return; }
  o.speed01 = d.policy === 'charge' ? 1 : 0;
  if (v.t < d.actAt) return;
  o.headingDeg = wrap360(aimAt(v, p.torpScreenMps, j) + d.err);
  if (Math.abs(wrap180(v.h - o.headingDeg)) > H.aimTolDeg) return;
  o.fireN = 4; o.fireSpreadDeg = p.spacingDeg * 3; d.shot++;
  d.holdH = o.headingDeg; d.holdUntil = v.t + 4 * H.holdS + 0.1; d.mode = HOLD;
}

/** 帰る: 中継待ちなら中継の輪へ、追尾の間は帰投の輪の外で待つ、ほかは輪へ（見つかっていれば全速・charge は撃った後も全速・bb_ambush は撃った後に列から離れるまで西へ） */
function home(d, v, o, run) {
  const p = d.plan, relay = v.rep === REP_PENDING, tx = relay ? p.relayX : p.ringX, ty = relay ? p.relayY : p.ringY;
  const wait = v.rep === REP_TRACK && dist2(v.x, v.y, p.ringX, p.ringY) <= (p.ringR + H.ringWaitM) ** 2;
  if (wait && !run) return;
  const q = nearestQ(v);
  if (d.fired && d.policy === 'bb_ambush' && q <= H.quietM * H.quietM) { o.headingDeg = 270; o.speed01 = 1; return; } // 撃った待ち伏せは列を横切らず西（列の後ろ）へ全速で離れる
  o.headingDeg = bearing(v.x, v.y, tx, ty);
  if (run || (d.fired && d.policy === 'charge')) { o.speed01 = 1; return; } // 撃った後の全速は charge だけ（lead の L38）
  // 見つかっていなければ: 輝点か目で見える艦が holdM の内なら止まって過ぎるのを待ち、quietM の内なら静音、その外は巡航
  o.speed01 = q <= H.holdM * H.holdM ? 0 : q <= H.quietM * H.quietM ? p.silent01 : p.cruise01;
}

/** 輝点と目で見える艦のうち最も近い 2 乗の距離（無ければ Infinity） */
function nearestQ(v) {
  let q = Infinity;
  for (let k = 0; k < v.bn; k++) q = Math.min(q, dist2(v.x, v.y, v.bx[k], v.by[k]));
  for (let j = 0; j < v.en; j++) q = Math.min(q, dist2(v.x, v.y, v.ex[j], v.ey[j]));
  return q;
}
