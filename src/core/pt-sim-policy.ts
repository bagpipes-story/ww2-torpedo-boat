// 米PT の掃射の航過の模擬（core/pt-pass-sim）の遊び方の台本（v0.6.3。spec §F.2、v0.6.3 実機 1 回目 spec r1 §G.1。pt-pass-sim から分けた。300 行を超えないため）。
// 艇長に見えるものだけを使う: ふだんの速さ、赤い線を見たらどうかわすか、T-14 の 13mm をいつ撃つか（射撃ボタンを押し続ける）、見つかったら舷側を向けるか。Phaser 非依存。
import type { BoatState } from './boat-motion';
import { PT_LEAVE, type PtBoatState } from './pt-boats';

/** 撃たない遊び方（spec §F.2）。表の順 */
export const PT_POLICIES = ['cruise', 'silent', 'full', 'zigzag', 'turn_cruise', 'react_full', 'dodge_silent', 'turn_silent', 'late_turn', 'turn_full', 'dark_stop', 'meet', 'stop_dawn', 'edge_flee'] as const;
/** 13mm を撃つ遊び方（v0.6.3 実機 1 回目。spec r1 §G.1。表の順）。撃たない表とは別の検査（tests/pt-gun-sim。1 ファイル 20 秒を超えないため） */
export const PT_GUN_POLICIES = ['shoot_cruise', 'turn_shoot', 'react_shoot', 'late_shoot', 'stop_shoot', 'fight', 'silent_shoot', 'dark_shoot'] as const;
export type PtNoGunPolicy = (typeof PT_POLICIES)[number];
export type PtGunPolicy = (typeof PT_GUN_POLICIES)[number];
export type PtPolicy = PtNoGunPolicy | PtGunPolicy;

/** ふだんの速さ（静音の上限 14 kt・巡航 20 kt・全速） */
export type PtSimSpeed = 'silent' | 'cruise' | 'full';

/**
 * 台本: ふだんの速さ、赤い線を見たら（何もしない・線から離れる直角へ・PT へ向かう）とそのときの速さ、反応の秒（NaN は乱数）。
 * shoot（13mm）: detected は見つかっている間（HUD の「発見された！」）に生きた PT が見えていれば押す、always は見えていればいつも押す（無しは撃たない）。
 * stance: 見つかっていて脅威の PT が見えている間（出発の後）、舷側（±90° の近い方）をその PT へ向け、stop は止まる・broadside は静音（赤い線の転舵が優先）
 */
export interface PtPolicySpec {
  base: PtSimSpeed; dodge: 'none' | 'away' | 'toward'; dodgeSpeed: PtSimSpeed; reactS: number;
  shoot?: 'detected' | 'always'; stance?: 'stop' | 'broadside';
}

export const PT_POLICY_SPECS: Readonly<Record<PtPolicy, PtPolicySpec>> = {
  cruise: { base: 'cruise', dodge: 'none', dodgeSpeed: 'cruise', reactS: NaN },
  silent: { base: 'silent', dodge: 'none', dodgeSpeed: 'silent', reactS: NaN },
  full: { base: 'full', dodge: 'none', dodgeSpeed: 'full', reactS: NaN },
  zigzag: { base: 'cruise', dodge: 'none', dodgeSpeed: 'cruise', reactS: NaN },
  turn_cruise: { base: 'cruise', dodge: 'away', dodgeSpeed: 'cruise', reactS: NaN },
  react_full: { base: 'cruise', dodge: 'away', dodgeSpeed: 'full', reactS: NaN },
  dodge_silent: { base: 'silent', dodge: 'away', dodgeSpeed: 'full', reactS: NaN },
  turn_silent: { base: 'silent', dodge: 'away', dodgeSpeed: 'silent', reactS: NaN },
  late_turn: { base: 'cruise', dodge: 'away', dodgeSpeed: 'cruise', reactS: 2.0 },
  turn_full: { base: 'full', dodge: 'away', dodgeSpeed: 'full', reactS: NaN },
  dark_stop: { base: 'silent', dodge: 'away', dodgeSpeed: 'silent', reactS: NaN },
  meet: { base: 'cruise', dodge: 'toward', dodgeSpeed: 'cruise', reactS: NaN },
  stop_dawn: { base: 'cruise', dodge: 'none', dodgeSpeed: 'cruise', reactS: NaN },
  // 縁へ逃げる（v0.6.3 レビュー）: 見つかったら全速で北の縁へ走って止まり、PT がみな去ってから巡航で帰る（縁で航過が撃たずに終わる抜け道が無いことを見る）
  edge_flee: { base: 'cruise', dodge: 'none', dodgeSpeed: 'cruise', reactS: NaN },
  // 13mm（v0.6.3 実機 1 回目）: 巡航のまま撃つ・HUD どおりの転舵 + 撃つ（★）・巡航で全速の転舵 + 撃つ・2 秒遅れの転舵 + 撃つ・
  // 止まって舷側を向けて撃ち合う（★。罠）・静音で舷側を向け転舵もする・静音のまままっすぐ撃つ・暗さに隠れて見えたらいつも撃つ（★。dark_stop と同じ動き）
  shoot_cruise: { base: 'cruise', dodge: 'none', dodgeSpeed: 'cruise', reactS: NaN, shoot: 'detected' },
  turn_shoot: { base: 'silent', dodge: 'away', dodgeSpeed: 'full', reactS: NaN, shoot: 'detected' },
  react_shoot: { base: 'cruise', dodge: 'away', dodgeSpeed: 'full', reactS: NaN, shoot: 'detected' },
  late_shoot: { base: 'cruise', dodge: 'away', dodgeSpeed: 'cruise', reactS: 2.0, shoot: 'detected' },
  stop_shoot: { base: 'silent', dodge: 'none', dodgeSpeed: 'silent', reactS: NaN, shoot: 'detected', stance: 'stop' },
  fight: { base: 'silent', dodge: 'away', dodgeSpeed: 'full', reactS: NaN, shoot: 'detected', stance: 'broadside' },
  silent_shoot: { base: 'silent', dodge: 'none', dodgeSpeed: 'silent', reactS: NaN, shoot: 'detected' },
  dark_shoot: { base: 'silent', dodge: 'away', dodgeSpeed: 'silent', reactS: NaN, shoot: 'always' },
};

/** 見つかる前に PT が見えたら止まる遊び方（dark_stop と同じ動き） */
export function stopsInDark(policy: PtPolicy): boolean {
  return policy === 'dark_stop' || policy === 'dark_shoot';
}

// 台本の値（模擬の設定。ゲームの値ではない。lead の試作 ptsim3.final と同じ）: 出発の遅れの最大・赤い線から反応までの秒（一様）・転舵の角と保つ秒（meet は PT へ 3 秒）・
// ジグザグ（±40° を 3 秒ごと）・dark_stop の止まる秒の上限・火災を消すまでの秒・edge_flee が止まる縁からの m（押し戻しの余白の外）
export const PT_PLAY = { departMaxS: 4, reactMinS: 0.4, reactMaxS: 1.2, dodgeDeg: 90, dodgeHoldS: 4, meetHoldS: 3, zigzagDeg: 40, zigzagLegS: 3, darkStopMaxS: 40, fireOutS: 1.5, edgeStopM: 15 } as const;
/** 台本の乱数の系列（seed × 7919 + 1000。米PT・13mm の系列とは別） */
export const PT_POLICY_SEED_MUL = 7919;
export const PT_POLICY_SEED_ADD = 1000;

/** PT がみな去った（去る途中・沈んだも） */
export function allLeft(boats: readonly PtBoatState[]): boolean {
  for (let i = 0; i < boats.length; i++) if (boats[i]!.phase < PT_LEAVE) return false;
  return true;
}

/** 去っていない（沈んでいない）PT のどれかが艇の視程の内（艇長に見えている） */
export function ptInSight(boats: readonly PtBoatState[], boat: BoatState, vis2: number): boolean {
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i]!;
    if (b.phase < PT_LEAVE && (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y) <= vis2) return true;
  }
  return false;
}
