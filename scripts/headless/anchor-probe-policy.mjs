// us_06「オルモック湾の決着」の探りの台本（v0.8.1 S3。spec-v0810 §3.9 D-P2・D-P3、lead の L52〜L54）。素の JS: src を読み込まない・ゲームの乱数も JS の既定の乱数も使わない・世界の物を受け取らない。
// 読むのは scripts/headless/anchor-probe.mjs のページの糊が毎フレーム書く素の見え方（view）だけ＝人が画面と Briefing で知れる物: 地図（出発点・帰投の輪・岸の線・Briefing が言う停泊地＝
// 種の位置そのもの）・レーダーの輝点（位置と置いた秒）・目で見える艦（視程の内の位置と絵の種類・目で見た位置の差から出した速さ）・HUD（3 行目の見つかる距離・発見された・照らされている・
// HP・燃料・魚雷の残り・輪の中・時刻と夜明けまで・撃沈の数と輸送船の撃沈）。書くのは素の出力（針路・速さ・撃つ本数と扇の開き角）だけ（tests/anchor-probe-scan が名前を走査する）。
// 人の揺らぎ（反応 0.5〜2 秒・狙い ±2°）はこの台本だけの乱数（seed × 7907 ＋ 40483 の mulberry32。ゲームの seed〜seed+43 の系列と重ならない＝v0.8.0 S3 の L19 と同じ足し算）。
// 台本（spec の D-P3。点は spec の値。駆潜艇はわざとはよけない＝目とレーダーで見えるだけ）:
//   shore_east      巡航で (5100, 1500) → 静音で浜 (5100, 2870) → 静音で浜沿いに西へ、卯月（レーダーの最初の接触か目で見た位置）の真南で止まり 4 本の扇（12°）→ 東へ離れる
//   open_north      出発点から卯月の北 900 m へ静音で寄って（目で見えなければ見えるまで静音で寄る）4 本 → 輪の方へ静音で離れる
//   shore_east_nb   shore_east と同じ（ページは ?debug&nobackdrop）／ charge 全速で卯月へ、900 m の内で目で見えたら全速のまま 4 本、全速で輪へ
//   transport_first 北を大きく回って（帰投の輪の南の (4600, 1000)・(2000, 900)・(1800, 1900) を巡航）西の浜 (1800, 2880) → 静音で浜沿いに東へ、輸送船が見えて 650 m の内で 2 本 → 卯月が見えて 650 m の内なら 2 本 → 東へ離れる
//   idle            出発点で止まったまま（漂流と夜明けの空襲の確かめ）
// 離れ方（L54）: 静音で離れ、見えている艦・レーダーの輝点・Briefing の輸送船（沈めるまで）のどれからも 1,200 m 離れたら巡航で輪へ。発見された・照らされている間は（反応の後）全速。
// 狙う・撃つのは目で見えている艦だけ。夜明けの 60 秒前になっても撃つ前なら輪へ帰る。確保は作る時だけ。
// v0.8.1 IP2（水上機）: obey（HUD=1）の時だけ HUD の 2 行目の字（view の line2）に従う＝「敵機 N m ・ …」の間は反応の後に静音、行が消えたら元へ。「爆撃進路！」「爆弾投下！」は
// 反応の後に左右へ 90° 転舵して全速。charge・idle は従わない。obey の無い台本は S3 のまま（乱数の引き方も同じ＝?debug&noplane の夜は S3〜IP1 と同じ夜）。

export const ANCHOR_POLICIES = ['shore_east', 'open_north', 'shore_east_nb', 'charge', 'transport_first', 'idle'];
export const ANCHOR_HARD_POLICIES = ['shore_east', 'open_north'];
/** 台本の目安（design。ゲームの強さの値ではない）: 乱数の掛け算と足し算・反応の秒・狙いの ±度と許し・着いた m・離れ終える m と秒の上限・夜明けの前の帰る秒・扇の 1 本の秒・止まって見える速さの 2 乗・静音の速さ（静音の帯の上限の比）・寄る m・離れる縁の m */
export const ANCHOR_HUMAN = { seedMul: 7907, seedAdd: 40483, reactS: [0.5, 2], aimDeg: 2, aimTolDeg: 1.5, arriveM: 40, clearM: 1200, leaveMaxS: 45, dawnHomeS: 60, holdS: 0.4, still2: 0.25, silentFrac: 0.95, nearM: 650, northM: 900, chargeM: 900, edgeM: 300 };

const CRUISE = 1, SILENT = 2;
/** 道（legs: 点と速さ）・攻撃（who 艦の種類 0 駆逐艦 1 輸送船・n 本・how 寄り方・stop 止まる所）・離れ方 */
const SHORE = { legs: [[5100, 1500, CRUISE], [5100, 2870, SILENT]], hits: [{ who: 0, n: 4, how: 'beach', stop: 'south' }], leave: 'east' };
const ROUTES = {
  shore_east: SHORE, shore_east_nb: SHORE,
  open_north: { legs: [], hits: [{ who: 0, n: 4, how: 'north', stop: 'point' }], leave: 'ring' },
  charge: { legs: [], hits: [{ who: 0, n: 4, how: 'charge', stop: 'near' }], leave: 'full' },
  transport_first: { legs: [[4600, 1000, CRUISE], [2000, 900, CRUISE], [1800, 1900, CRUISE], [1800, 2880, SILENT]], hits: [{ who: 1, n: 2, how: 'beach', stop: 'near' }, { who: 0, n: 2, how: 'beach', stop: 'near' }], leave: 'east' },
  idle: { legs: [], hits: [], leave: 'none' },
};
const LEGS = 0, APPROACH = 1, AIM = 2, HOLD = 3, LEAVE = 4, HOME = 5;
const PLANE_APPROACH_RE = /^敵機 \d+ m ・ /, PLANE_BOMB_RE = /^(爆撃進路！|爆弾投下！)/; // HUD の 2 行目の水上機の文（ui/hud-lines の seaplaneLine）: 未確定の接近・爆撃進路と投下

/** 台本だけの乱数（mulberry32。0 以上 1 未満） */
function nextRand(d) {
  d.rs = (d.rs + 0x6d2b79f5) >>> 0;
  let z = d.rs;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
}
const range = (d, a, b) => a + (b - a) * nextRand(d);
const wrap360 = (a) => ((a % 360) + 360) % 360;
const wrap180 = (a) => wrap360(a + 180) - 180;
const bearing = (x, y, tx, ty) => wrap360((Math.atan2(tx - x, -(ty - y)) * 180) / Math.PI);
const dist2 = (x, y, tx, ty) => (tx - x) * (tx - x) + (ty - y) * (ty - y);

/** plan: 地図と艇の知れる値（糊が作る時に 1 回）。目の推定 est: 種類ごとの最後の位置・速さ・今見えているか・沈んだか */
export function createAnchorDriver(policy, seed, plan, obey = false) {
  const r = ROUTES[policy];
  if (!r) throw new Error(`知らない台本 ${policy}`);
  const est = [0, 1].map((k) => ({ x: k === 0 ? plan.uzX : plan.trX, y: k === 0 ? plan.uzY : plan.trY, vx: 0, vy: 0, seen: false, gone: false, sweep: NaN }));
  return { policy, r, plan, rs: (seed * ANCHOR_HUMAN.seedMul + ANCHOR_HUMAN.seedAdd) >>> 0, est, mode: r.legs.length > 0 ? LEGS : r.hits.length > 0 ? APPROACH : HOME, leg: 0, hit: 0, actAt: NaN, err: 0, holdH: 0, holdUntil: 0, leaveUntil: NaN, alarmAt: NaN,
    obey: obey === true && policy !== 'charge' && policy !== 'idle', planeAt: NaN, dodgeAt: NaN, dodgeH: 0 };
}

/** 目とレーダーで推定を直す（駆逐艦は目で見えなければ推定に最も近い輝点。輸送船はレーダーに映らない＝Briefing の位置か目で見た位置） */
function updateEstimates(d, v) {
  for (let k = 0; k < 2; k++) {
    const e = d.est[k];
    e.seen = false;
    if (k === 0 ? v.ddSunk > 0 : v.trSunk) e.gone = true;
    if (e.gone) continue;
    let best = -1, bd = Infinity;
    for (let j = 0; j < v.en; j++) if (v.ekind[j] === k) { const q = dist2(e.x, e.y, v.ex[j], v.ey[j]); if (q < bd) { bd = q; best = j; } }
    if (best >= 0) {
      e.x = v.ex[best]; e.y = v.ey[best]; e.vx = v.evx[best]; e.vy = v.evy[best]; e.seen = true;
      continue;
    }
    if (k !== 0 || v.bn === 0 || v.sweepS === e.sweep) continue;
    for (let j = 0; j < v.bn; j++) { const q = dist2(e.x, e.y, v.bx[j], v.by[j]); if (q < bd) { bd = q; best = j; } }
    const dt = v.sweepS - e.sweep;
    if (best >= 0 && bd <= 800 * 800) {
      if (dt > 0 && dt <= 4.5) { e.vx = (v.bx[best] - e.x) / dt; e.vy = (v.by[best] - e.y) / dt; } else { e.vx = 0; e.vy = 0; }
      e.x = v.bx[best]; e.y = v.by[best];
    }
    e.sweep = v.sweepS;
  }
}

/** 魚雷の針路（止まって見える艦はその方位、動く艦は見越し＝|D + V t| = s t の最も早い正の t。解けなければ方位） */
function aimAt(v, s, e) {
  const vv = e.vx * e.vx + e.vy * e.vy;
  if (vv < ANCHOR_HUMAN.still2) return bearing(v.x, v.y, e.x, e.y);
  const dx = e.x - v.x, dy = e.y - v.y;
  const a = vv - s * s, b = 2 * (dx * e.vx + dy * e.vy), c = dx * dx + dy * dy;
  let t = NaN;
  if (Math.abs(a) < 1e-9) t = b < 0 ? -c / b : NaN;
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a);
      t = r1 > 0 && (r1 < r2 || r2 <= 0) ? r1 : r2 > 0 ? r2 : NaN;
    }
  }
  return t > 0 ? bearing(v.x, v.y, e.x + e.vx * t, e.y + e.vy * t) : bearing(v.x, v.y, e.x, e.y);
}

/** 知れる接触（目・輝点・Briefing の輸送船）のどれからも clearM 以上か */
function clearOfAll(d, v) {
  const c2 = ANCHOR_HUMAN.clearM * ANCHOR_HUMAN.clearM;
  for (let j = 0; j < v.en; j++) if (dist2(v.x, v.y, v.ex[j], v.ey[j]) < c2) return false;
  for (let j = 0; j < v.bn; j++) if (dist2(v.x, v.y, v.bx[j], v.by[j]) < c2) return false;
  const tr = d.est[1];
  return tr.gone || dist2(v.x, v.y, tr.x, tr.y) >= c2;
}

/** 1 フレームの台本（固定ステップの前）。o に針路（NaN は保つ）・速さ（全速の比）・撃つ本数と扇の開き角を書く。obey なら最後に水上機の HUD に従う（IP2） */
export function stepAnchorDriver(d, v, o) {
  stepRoute(d, v, o);
  if (d.obey) obeyPlane(d, v, o);
}

/** 水上機の HUD に従う（IP2。行が出た時に 1 回だけ反応の秒と向きを引く） */
function obeyPlane(d, v, o) {
  const H = ANCHOR_HUMAN, warn = PLANE_APPROACH_RE.test(v.line2), bomb = PLANE_BOMB_RE.test(v.line2);
  if (warn) { if (Number.isNaN(d.planeAt)) d.planeAt = v.t + range(d, H.reactS[0], H.reactS[1]); } else d.planeAt = NaN;
  if (bomb) { if (Number.isNaN(d.dodgeAt)) { d.dodgeAt = v.t + range(d, H.reactS[0], H.reactS[1]); d.dodgeH = wrap360(v.h + (nextRand(d) < 0.5 ? 90 : -90)); } } else d.dodgeAt = NaN;
  if (warn && v.t >= d.planeAt && o.speed01 > d.plan.silent01) o.speed01 = d.plan.silent01;
  if (bomb && v.t >= d.dodgeAt) { o.headingDeg = d.dodgeH; o.speed01 = 1; }
}

/** S3 の台本（道・寄る・狙う・離れる・帰る） */
function stepRoute(d, v, o) {
  const p = d.plan, H = ANCHOR_HUMAN, r = d.r;
  o.headingDeg = NaN; o.speed01 = 0; o.fireN = 0; o.fireSpreadDeg = 0;
  updateEstimates(d, v);
  if (d.policy === 'idle') return;
  if (v.atHome) { d.mode = HOME; return; }
  // 発見された・照らされている: 反応の後に全速（離れる・帰る段だけ。寄る・狙う間は道のまま。消えたら解く）
  if (v.seen || v.lit) { if (Number.isNaN(d.alarmAt)) d.alarmAt = v.t + range(d, H.reactS[0], H.reactS[1]); } else d.alarmAt = NaN;
  const run = !Number.isNaN(d.alarmAt) && v.t >= d.alarmAt;
  if ((d.mode === LEGS || d.mode === APPROACH) && (v.leftS <= H.dawnHomeS || v.torps <= 0)) d.mode = r.leave === 'none' ? HOME : LEAVE;
  if (d.mode === LEGS) {
    const [x, y, sp] = r.legs[d.leg];
    o.headingDeg = bearing(v.x, v.y, x, y);
    o.speed01 = sp === CRUISE ? p.cruise01 : p.silent01;
    if (dist2(v.x, v.y, x, y) <= H.arriveM * H.arriveM && ++d.leg >= r.legs.length) d.mode = APPROACH;
    return;
  }
  if (d.mode === APPROACH) approach(d, v, o);
  if (d.mode === AIM) aim(d, v, o);
  if (d.mode === HOLD) {
    o.headingDeg = d.holdH;
    o.speed01 = r.hits[d.hit].how === 'charge' ? 1 : 0;
    if (v.t < d.holdUntil) return;
    d.hit++;
    d.mode = d.hit < r.hits.length && v.torps > 0 ? APPROACH : LEAVE;
  }
  if (d.mode === LEAVE) {
    if (Number.isNaN(d.leaveUntil)) d.leaveUntil = v.t + H.leaveMaxS;
    if (r.leave === 'full' || clearOfAll(d, v) || v.t >= d.leaveUntil || v.x >= p.width - H.edgeM) d.mode = HOME;
    else {
      o.headingDeg = r.leave === 'east' ? 90 : bearing(v.x, v.y, p.ringX, p.ringY);
      o.speed01 = run ? 1 : p.silent01;
      return;
    }
  }
  if (d.mode === HOME) {
    o.headingDeg = bearing(v.x, v.y, p.ringX, p.ringY);
    o.speed01 = run || r.leave === 'full' ? 1 : p.cruise01;
  }
}

/** 寄る段（見つかっても道と速さのまま）: 狙う艦が沈んだか見失ったまま着いたら次へ。目で見えていて止まる所なら狙う段へ */
function approach(d, v, o) {
  const p = d.plan, H = ANCHOR_HUMAN, h = d.r.hits[d.hit], e = d.est[h.who];
  if (e.gone) { d.mode = HOLD; d.holdUntil = v.t; d.holdH = v.h; return; }
  const near = dist2(v.x, v.y, e.x, e.y) <= (h.how === 'charge' ? H.chargeM : H.nearM) ** 2;
  let tx = e.x, ty = e.y, sp = p.silent01, at = near;
  if (h.how === 'beach') {
    ty = d.r.legs.length > 0 ? d.r.legs[d.r.legs.length - 1][1] : v.y;
    const south = Math.abs(v.x - e.x) <= H.arriveM;
    if (south && !e.seen) { d.mode = HOLD; d.holdUntil = v.t; d.holdH = v.h; return; }
    if (h.stop === 'south') at = south;
  } else if (h.how === 'north') {
    // 北の点に着いたら（目で見えなければ見えるまで）卯月へ静音で寄る
    at = dist2(v.x, v.y, e.x, e.y - H.northM) <= H.arriveM * H.arriveM || v.y > e.y - H.northM;
    if (!at) ty = e.y - H.northM;
  } else sp = 1;
  if (at && e.seen) { d.mode = AIM; d.actAt = v.t + range(d, H.reactS[0], H.reactS[1]); d.err = range(d, -H.aimDeg, H.aimDeg); return; }
  o.headingDeg = bearing(v.x, v.y, tx, ty);
  o.speed01 = sp;
}

/** 狙う段: 反応の後に狙いのずれ込みの針路へ向き、向けば扇を撃って構えたまま扇の秒だけ待つ。見失えば寄る段へ戻る */
function aim(d, v, o) {
  const p = d.plan, H = ANCHOR_HUMAN, h = d.r.hits[d.hit], e = d.est[h.who];
  if (!e.seen) { d.mode = APPROACH; return; }
  o.speed01 = h.how === 'charge' ? 1 : 0;
  if (v.t < d.actAt) return;
  o.headingDeg = wrap360(aimAt(v, p.torpScreenMps, e) + d.err);
  if (Math.abs(wrap180(v.h - o.headingDeg)) > H.aimTolDeg) return;
  o.fireN = h.n;
  o.fireSpreadDeg = p.spacingDeg * (h.n - 1);
  d.holdH = o.headingDeg;
  d.holdUntil = v.t + h.n * H.holdS + 0.1;
  d.mode = HOLD;
}
