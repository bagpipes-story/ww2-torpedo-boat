// 隼艇（v0.6.6「日本ハードモード⑤：隼艇」。jp_01 のハードだけ。spec-v066 §B.6・§C.6）の任務の読み出し: ハードの組み立てのときだけ v0_1_prototype.hard.gunboat を読み、
// boats.json の艇（運動・HP・砲）と合わせて GunboatParams を組む（形と値の検査は core/gunboat-data）。他の記録を跨ぐ検査はここ: 輸送隊（convoy）と米PT の隊（pt_boats）の任務だけ・
// 僚艇（escort）と同居しない・輸送隊に浜（beach）がある（決着の後の浜の点を先頭の上陸地点から作る）・艇が boats.json にあり gun_battery（弾倉付き）と hull_hp を持つ・
// 1 回の航過と 1 回の連射の弾 × 被害 < 隼艇の HP（config/pt-mission-data の自艇の検査と同じ式）・砲の射程 ≤ 自艇の視程・閃光 ≥ 射程。
// world-setup が組み立てのたびに（gunboatSetupPart）。game-data.ts が 300 行に近いので別ファイル（engine-mission-data と同じ作法）。
import { getVisibilityParams, type GameData } from './game-data';
import type { PrototypeMission } from './mission-data';
import { isBoatDataRecord } from '../core/boat-motion';
import { gunBatteryParamsFromData, isGunBatteryDataRecord } from '../core/gun-battery';
import { gunboatBad, gunboatParamsFromData, readGunboatBlock } from '../core/gunboat-data';
import type { GunboatParams } from '../core/gunboat';
import { isPtDataRecord } from '../core/pt-data';
import { playerVisRangeM } from '../core/visibility';

export type { GunboatParams } from '../core/gunboat';

/** 隼艇の値。ハードでない・hard.gunboat の無い任務は null。data が壊れている・同居できない任務なら「<任務>.v0_1_prototype.hard.gunboat: …」の例外 */
export function getGunboatParams(data: GameData, mission: PrototypeMission): GunboatParams | null {
  if (!mission.hard) return null;
  type Rec = Record<string, unknown>;
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const raw = (((m?.['v0_1_prototype'] as Rec | undefined)?.['hard'] as Rec | undefined) ?? {})['gunboat'];
  if (raw === undefined) return null;
  const label = `${mission.id}.v0_1_prototype.hard.gunboat`;
  const bad = gunboatBad(label);
  const block = readGunboatBlock(raw, label);
  if (!mission.convoy || !mission.ptBoats) return bad('輸送隊（convoy）と米PT の隊（pt_boats）の任務だけ（大発を守る僚艇）');
  if (mission.escort) bad('僚艇（escort）と同居しない');
  if (!mission.convoy.beach) bad('輸送隊に浜（convoy.beach）が要る（決着の後の浜の点を先頭の上陸地点から作る）');
  const rec = (data.boats.boats as readonly Rec[]).find((b) => b['id'] === block.boat) ?? bad(`boat（${block.boat}）が boats.json に無い`);
  if (!isBoatDataRecord(rec)) return bad(`boats.json の ${block.boat} に運動の値（speed_* / speed_bands_kt / accel・decel・turn / length・beam）が無い`);
  const hp = (rec as unknown as Rec)['hull_hp'];
  if (typeof hp !== 'number' || !(hp > 0)) return bad(`boats.json の ${block.boat}.hull_hp（正の数）が無い（隼艇の HP）`);
  const g = (rec as unknown as Rec)['gun_battery'];
  if (!isGunBatteryDataRecord(g)) return bad(`boats.json の ${block.boat}.gun_battery（label_ja / range_m / effective_m / dead_cone_deg / muzzle_flash_reveal_m / spread_factor / groups）が無い`);
  let gun: ReturnType<typeof gunBatteryParamsFromData>;
  try {
    gun = gunBatteryParamsFromData(g);
  } catch (e) {
    return bad(`${block.boat}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!gun.magazine) bad(`boats.json の ${block.boat}.gun_battery は magazine（弾倉の発数・交換秒）を持つ（米PT の任務の砲）`);
  const w = data.hitRateModel.world;
  const p = gunboatParamsFromData(block, { record: rec, hullHp: hp, gun, hitScale: w.hit_scale, spriteScale: w.sprite_scale }, label);
  // W2: 隼艇は 1 回の航過・連射では砲だけで沈まない（自艇の検査と同じ式を隼艇の HP で。今 10 × 4 = 40 < 60・6 × 4 = 24 < 60）
  const pt = (data.enemies.enemies as readonly unknown[]).find((e) => (e as Rec)['id'] === mission.enemyId);
  if (!isPtDataRecord(pt)) return bad(`enemies.json の ${mission.enemyId} に米PT の値が無い`);
  const dmg = pt.guns[0]!.damage;
  if (!(pt.attack.rounds_per_pass * dmg < hp)) bad(`米PT の rounds_per_pass × damage（${pt.attack.rounds_per_pass * dmg}）は隼艇の HP（${hp}）未満（1 回の航過では砲だけで沈まない）`);
  if (!(pt.chase.burst_rounds * dmg < hp)) bad(`米PT の chase.burst_rounds × damage（${pt.chase.burst_rounds * dmg}）は隼艇の HP（${hp}）未満（1 回の連射では砲だけで沈まない）`);
  const visM = playerVisRangeM(getVisibilityParams(data, mission.moon, false));
  if (!(gun.rangeM <= visM)) bad(`隼艇の gun_battery の range_m（${gun.rangeM} m）は自艇の視程（${visM} m）以下（見えない PT へ撃たない）`);
  if (!(gun.flashRevealM >= gun.rangeM)) bad(`隼艇の gun_battery の muzzle_flash_reveal_m（${gun.flashRevealM} m）は range_m（${gun.rangeM} m）以上（撃てば撃った PT に見える）`);
  return p;
}

/** 組み立ての上書き（systems/world-setup の SetupOptions の 1 鍵）: gunboatOff は隼艇を切る（模擬の GUNBOAT_OFF。ハードでも米PT 3 隻・ノルマ 3 のまま） */
export interface GunboatSetupOptions {
  gunboatOff?: boolean;
}

/** WorldSetup に展開する部分: 隼艇の無い任務・ノーマル・gunboatOff は {}（gunboat の鍵ごと出ない＝他の任務の setup の snapshot が変わらない。engineSetupPart と同じ作法） */
export function gunboatSetupPart(data: GameData, mission: PrototypeMission, o: GunboatSetupOptions): { gunboat?: GunboatParams } {
  const p = o.gunboatOff ? null : getGunboatParams(data, mission);
  return p ? { gunboat: p } : {};
}
