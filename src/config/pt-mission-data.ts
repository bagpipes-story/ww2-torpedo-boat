// 敵の米PT（v0.6.3。docs/02 §6.4）の数値の読み出し: enemies.json の PT・boats.json の boat_ref・任務の pt_boats から core/pt-data の PtParams を組み、
// 他の記録が要る検査（spec §C.3 の 6〜10: 振り切れない・1 回の航過で沈まない・見えない PT から撃たない・出発で見つからない（史実モード込み）・夜明けに去る）を足す。
// v0.6.3 実機 2 回目: 追撃（chase）も振り切れない（speed_kt > 自艇の最大）・1 回の連射で沈まない（burst_rounds × damage < 自艇の HP）。
// 主兵装が guns（v0.6.3 実機 1 回目。T-14 の 13mm）なら自艇の砲の検査も: 弾倉がある・見えない PT へ撃たない（射程 ≤ 視程）・撃てば撃った相手に見える（閃光 ≥ 射程）。
// 1 弾倉 × damage を PT の HP と比べる検査は外した（レビュー F8: PT は HP だけでは沈まない＝pt-data の retreat_hp < hull_hp。守るものが無く、25mm の 15 発 × 7 などの差し替えを誤った文で止めた）。
// 米PT の隊の無い任務は null（dawn-data と同じ形）。world-setup が組み立てのたびに呼ぶ（壊れた data は任務の id を付けて例外）。
import { getBoatDamageParams, getBoatRecord, getGunBatteryParams, getVisibilityParams, type GameData } from './game-data';
import type { PrototypeMission } from './mission-data';
import { getDawnAir } from './dawn-data';
import { PT_ATTACK_KEYS, isPtDataRecord, ptParamsFromData, ptStartAt, type PtParams } from '../core/pt-data';
import type { NightBlock } from '../core/night';
import { clamp, degToRad } from '../core/units';
import { enemyDetectRangeM, playerVisRangeM, speedFactorForBand } from '../core/visibility';

export function getPtParams(data: GameData, mission: PrototypeMission, timeScale: number): PtParams | null {
  const block = mission.ptBoats;
  if (!block) return null;
  const id = mission.id;
  const rec = (data.enemies.enemies as readonly unknown[]).find((e) => (e as Record<string, unknown>)['id'] === mission.enemyId);
  if (!isPtDataRecord(rec)) throw new Error(`${id}: enemies.json の ${mission.enemyId} に米PT の値（boat_ref / torpedo_immune / detection / patrol / attack の ${PT_ATTACK_KEYS.length} 個 / guns 1 種 / tactics / under_fire / chase の 19 個）が無いか、attack・chase に知らないキーがある（docs/02 §6.4）`);
  const w = data.hitRateModel.world;
  const ptHp = getBoatDamageParams(data, rec.boat_ref).maxHp;
  const p = ptParamsFromData(rec, getBoatRecord(data, rec.boat_ref), block, { missionId: id, count: mission.enemyCount, bounds: mission.bounds, timeScale, detectHoldS: data.hitRateModel.visibility.detect_hold_s, spriteScale: w.sprite_scale, hitScale: w.hit_scale, hullHp: ptHp });
  const bad = (msg: string): never => {
    throw new Error(`${id}: 米PT（enemies.json の ${rec.id}）: ${msg}（docs/02 §6.4）`);
  };
  const a = rec.attack;
  const gun = rec.guns[0]!;
  const player = getBoatRecord(data, mission.playerBoatId);
  if (!(a.run_in_speed_kt > player.speed_max_kt)) bad(`突撃 run_in_speed_kt（${a.run_in_speed_kt} kt）は自艇の最大速力（${player.speed_max_kt} kt）より速い（PT は振り切れない）`);
  if (!(rec.chase.speed_kt > player.speed_max_kt)) bad(`追撃 chase.speed_kt（${rec.chase.speed_kt} kt）は自艇の最大速力（${player.speed_max_kt} kt）より速い（PT は振り切れない）`);
  const hp = getBoatDamageParams(data, mission.playerBoatId).maxHp;
  if (!(a.rounds_per_pass * gun.damage < hp)) bad(`rounds_per_pass × damage（${a.rounds_per_pass * gun.damage}）は自艇の HP（${hp}）未満（1 回の航過では砲だけで沈まない）`);
  if (!(rec.chase.burst_rounds * gun.damage < hp)) bad(`chase.burst_rounds × damage（${rec.chase.burst_rounds * gun.damage}）は自艇の HP（${hp}）未満（1 回の連射では砲だけで沈まない）`);
  const vis = getVisibilityParams(data, mission.moon, false);
  const visM = playerVisRangeM(vis);
  if (!(gun.effective_night_m <= visM)) bad(`effective_night_m（${gun.effective_night_m} m）は自艇の視程（${visM} m）以下（見えない PT から撃たない）`);
  const own = getGunBatteryParams(data, mission);
  if (own) {
    const mine = (msg: string): never => bad(`自艇（${mission.playerBoatId}）の gun_battery: ${msg}`);
    const mag = own.magazine;
    if (!mag) mine('米PT の任務の砲は magazine（弾倉の発数・交換秒）を持つ');
    if (!(own.rangeM <= visM)) mine(`range_m（${own.rangeM} m）は自艇の視程（${visM} m）以下（見えない PT へ撃たない）`);
    if (!(own.flashRevealM >= own.rangeM)) mine(`muzzle_flash_reveal_m（${own.flashRevealM} m）は range_m（${own.rangeM} m）以上（撃てば撃った PT に見える）`);
  }
  // 出発で見つからない: 今夜の揺らぎの取りうる出発点（線に沿って ±x・南北 ±y・東西反転）のどれも、巡航で見つかる距離より遠い。
  // 距離はノーマルと史実モード（Title の切り替え。見つかる距離に enemy_detection_multiplier を掛ける）の遠い方（v0.6.3 レビュー: ノーマルだけ見ていたので、史実モードの 3 夜に 1 夜は出発で見つかった）
  const histVis = getVisibilityParams(data, mission.moon, true);
  const detectM = Math.max(enemyDetectRangeM(p.baseDetectM, vis.speedFactor.cruise, vis, false), enemyDetectRangeM(p.baseDetectM, histVis.speedFactor.cruise, histVis, false));
  const nearM = nearestStartM(p, mission.night, mission.playerStart.x, mission.playerStart.y);
  if (!(nearM >= detectM)) bad(`今夜の揺らぎで出発点が自艇の出発点から ${Math.round(nearM)} m（巡航で見つかる ${Math.round(detectM)} m（史実モード込み）より近い。出発で見つかる）`);
  // 輸送隊（v0.6.4。jp_01）: 船団の先頭・最後尾（先頭の x の揺らぎ ±barge_lead_jitter_m 込み）も、大発の帯（convoy.detect_band）で見つかる距離（史実モード込み）より遠い（出発で大発が見つからない。jp_01 は約 1,464 m ≥ 624 m）
  if (mission.convoy) {
    const band = mission.convoy.detect_band;
    const bargeM = Math.max(enemyDetectRangeM(p.baseDetectM, speedFactorForBand(band, vis.speedFactor), vis, false), enemyDetectRangeM(p.baseDetectM, speedFactorForBand(band, histVis.speedFactor), histVis, false));
    const clearM = convoyStartClearM(p, mission);
    if (!(clearM >= bargeM)) bad(`今夜の揺らぎで出発点が船団（先頭〜最後尾）から ${Math.round(clearM)} m（大発が見つかる ${Math.round(bargeM)} m（史実モード込み）より近い。出発で大発が見つかる）`);
  }
  if (getDawnAir(data, id).shipsAtDawn !== 'none') bad('dawn_air.enemy_ships_at_dawn は none（v0.6.3 の米PT は夜明けに東へ去る。retire・hide・stay は他の敵の規則）');
  return p;
}

/** PT の出発点（揺らぎ・反転込み）から船団の先頭・最後尾（先頭の x の揺らぎ ±barge_lead_jitter_m 込みの 4 点）までの最短 m（検査と scripts/convoy-sim の表の頭）。輸送隊の無い任務は Infinity */
export function convoyStartClearM(p: PtParams, mission: PrototypeMission): number {
  const c = mission.convoy;
  if (!c) return Infinity;
  const jl = mission.night ? mission.night.bargeLeadJitterM : 0;
  const tailOff = Math.sin(degToRad(c.lead_start.heading_deg)) * (c.offsets_m[c.offsets_m.length - 1] ?? 0);
  let best = Infinity;
  for (const x of [c.lead_start.x_m - jl, c.lead_start.x_m + jl, c.lead_start.x_m - jl - tailOff, c.lead_start.x_m + jl - tailOff]) best = Math.min(best, nearestStartM(p, mission.night, x, c.lead_start.y_m));
  return best;
}

/** 揺らぎの取りうる出発点（PT ごと・反転ごとに、線に沿ったずれ × 南北のずれの平行四辺形）と点 (px, py) の最短距離 m。中なら 0 */
export function nearestStartM(p: PtParams, night: NightBlock | null, px: number, py: number): number {
  const jx = night ? night.enemyJitterXM : 0;
  const jy = night ? night.enemyJitterYM : 0;
  const mirrors = night && night.mirrorChance > 0 ? [false, true] : [false];
  const s = { x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, headingDeg: 0 };
  const cx = [0, 0, 0, 0];
  const cy = [0, 0, 0, 0];
  let best2 = Infinity;
  for (let i = 0; i < p.count; i++) {
    for (const mirrored of mirrors) {
      // 角を一周の順に（−x−y → +x−y → +x+y → −x+y）
      for (let k = 0; k < 4; k++) {
        ptStartAt(p, i, k === 1 || k === 2 ? jx : -jx, k >= 2 ? jy : -jy, mirrored, s);
        cx[k] = s.x;
        cy[k] = s.y;
      }
      let pos = 0;
      let neg = 0;
      for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4;
        const c = (cx[n]! - cx[k]!) * (py - cy[k]!) - (cy[n]! - cy[k]!) * (px - cx[k]!);
        if (c > 0) pos++;
        else if (c < 0) neg++;
        best2 = Math.min(best2, segDist2(px, py, cx[k]!, cy[k]!, cx[n]!, cy[n]!));
      }
      if (pos === 4 || neg === 4) return 0;
    }
  }
  return Math.sqrt(best2);
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  const dx = ax + vx * t - px;
  const dy = ay + vy * t - py;
  return dx * dx + dy * dy;
}
