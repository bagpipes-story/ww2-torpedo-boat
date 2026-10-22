// 味方の大発を守る模擬（core/convoy-sim）の遊び方の台本（v0.6.4。spec §F.2。pt-sim-policy と同じ考え: 艇長に見えるものだけを使う）。Phaser 非依存・毎ステップ確保しない。
// 動き（move）: none 出発点で止まって隠れ、決着（みな上陸か沈没）の後に巡航で帰投 / follow 最後尾の 200 m 後ろ・120 m 沖に 13 kt 以下で付く（着けば 7 kt）/ far 最後尾の 450 m 後ろ（遠くから撃つだけ）/
//   shield 脅威の PT が見えたら、その PT に最も近い大発から PT の方へ 150 m の点へ（見えなければ船団の真ん中の 180 m 沖）/ lead 先頭の 700 m 前・150 m 沖に静音で先行（先に見つかる囮。見つかったら輪へ巡航）/
//   dash 出発直後に巡航で輪へ（見捨てる）。shoot: 600 m 以内に戦う PT が見えている間 射撃を押す。dodge: 自艇への赤い線で HUD どおり（航過は逃げる針路へ全速 4 秒、連射は PT から離れる向きへ全速）。
// 決着の後（none 以外）と航行中の大発が無いときは巡航で帰投（輪に入った瞬間に終わる＝core/mission-flow と同じ）。
import type { BoatState } from './boat-motion';
import { convoyLeadIndex, convoyTailIndex, type ConvoyParams, type ConvoyState } from './convoy';
import { threatIndex, type PtSection } from './pt-boats';
import { bearingDeg } from './ship-ai';
import { degToRad } from './units';

/** 遊び方（表の順。★ は spec §F.4 の帯の主な行: none・shield_full（HUD どおり）・follow_full・follow_shoot） */
export const CONVOY_POLICIES = ['none', 'follow', 'follow_shoot', 'follow_dodge', 'follow_full', 'shield', 'shield_shoot', 'shield_dodge', 'shield_full', 'far_shoot', 'far_full', 'lead', 'lead_shoot', 'dash_home'] as const;
export type ConvoyPolicy = (typeof CONVOY_POLICIES)[number];
export type ConvoyMove = 'none' | 'follow' | 'far' | 'shield' | 'lead' | 'dash';

export interface ConvoyPolicySpec {
  move: ConvoyMove;
  shoot: boolean;
  dodge: boolean;
}

const spec = (move: ConvoyMove, shoot: boolean, dodge: boolean): ConvoyPolicySpec => ({ move, shoot, dodge });
export const CONVOY_POLICY_SPECS: Readonly<Record<ConvoyPolicy, ConvoyPolicySpec>> = {
  none: spec('none', false, false),
  follow: spec('follow', false, false), follow_shoot: spec('follow', true, false), follow_dodge: spec('follow', false, true), follow_full: spec('follow', true, true),
  shield: spec('shield', false, false), shield_shoot: spec('shield', true, false), shield_dodge: spec('shield', false, true), shield_full: spec('shield', true, true),
  far_shoot: spec('far', true, false), far_full: spec('far', true, true),
  // 囮は見つかったら輪へ巡航し、赤い線は転舵する（dodge）
  lead: spec('lead', false, true), lead_shoot: spec('lead', true, true),
  dash_home: spec('dash', false, false),
};

/** 台本の距離 m（模擬の設定。ゲームの値ではない）: 付く定位置（後ろ・沖）、遠い版の後ろ、割って入る点の大発からの距離、見えないときの沖、先行の前・沖、着いたとみなす、針路を船団に揃える */
export const CONVOY_PLAY = { followAsternM: 200, followOffM: 120, farAsternM: 450, shieldM: 150, shieldOffM: 180, leadAheadM: 700, leadOffM: 150, arriveM: 60, slowM: 5 } as const;

/** 台本の出力（1 夜に 1 個作って毎ステップ書く）: 針路 deg（NaN は保つ）と欲しい速さ game m/s（0 は止まる） */
export interface ConvoySteer {
  headingDeg: number;
  wantMps: number;
}

/** 台本が読む世界（1 夜に 1 個。boat・f・q は参照。silentMps・cruiseMps は艇の静音の上限と巡航） */
export interface ConvoySteerCtx {
  boat: BoatState;
  f: ConvoyState;
  cp: ConvoyParams;
  q: PtSection;
  ring: { x: number; y: number };
  visRange2: number;
  silentMps: number;
  cruiseMps: number;
}

/** (x, y) へ: 着く手前（arriveM）までは maxMps、着いたら slowMps。すぐそば（slowM）では針路を船団に揃える */
function toward(c: ConvoySteerCtx, x: number, y: number, maxMps: number, slowMps: number, out: ConvoySteer): void {
  const dx = x - c.boat.x;
  const dy = y - c.boat.y;
  const d2 = dx * dx + dy * dy;
  out.headingDeg = d2 > CONVOY_PLAY.slowM * CONVOY_PLAY.slowM ? bearingDeg(c.boat.x, c.boat.y, x, y) : c.cp.headingDeg;
  out.wantMps = d2 > CONVOY_PLAY.arriveM * CONVOY_PLAY.arriveM ? maxMps : slowMps;
}

function home(c: ConvoySteerCtx, out: ConvoySteer): void {
  toward(c, c.ring.x, c.ring.y, c.cruiseMps, c.cruiseMps, out);
}

/** 1 ステップの行き先と速さ（出発の遅れの後）。resolved は決着、fled は囮が見つかって帰る（呼ぶ側が q.detected で立てる） */
export function convoySteer(sp: ConvoyPolicySpec, c: ConvoySteerCtx, resolved: boolean, fled: boolean, out: ConvoySteer): void {
  const tail = convoyTailIndex(c.f, c.cp);
  if (sp.move === 'none') {
    if (resolved) home(c, out);
    return;
  }
  if (sp.move === 'dash' || resolved || tail < 0) {
    home(c, out);
    return;
  }
  const ux = Math.sin(degToRad(c.cp.headingDeg));
  const offY = c.cp.leadY;
  if (sp.move === 'follow' || sp.move === 'far') {
    const tb = c.f.barges[tail]!;
    toward(c, tb.x - ux * (sp.move === 'far' ? CONVOY_PLAY.farAsternM : CONVOY_PLAY.followAsternM), offY - CONVOY_PLAY.followOffM, c.silentMps, c.cp.speedMps, out);
  } else if (sp.move === 'shield') {
    const ti = threatIndex(c.q, c.boat.x, c.boat.y);
    const pt = ti >= 0 ? c.q.boats[ti]! : null;
    if (pt && (pt.x - c.boat.x) * (pt.x - c.boat.x) + (pt.y - c.boat.y) * (pt.y - c.boat.y) <= c.visRange2) {
      // 脅威の PT に最も近い航行中の大発から、PT の方へ shieldM の点
      let bb = c.f.barges[tail]!;
      let bd = Infinity;
      for (let i = 0; i < c.f.barges.length; i++) {
        const b = c.f.barges[i]!;
        if (b.phase !== 0) continue;
        const d2 = (b.x - pt.x) * (b.x - pt.x) + (b.y - pt.y) * (b.y - pt.y);
        if (d2 < bd) {
          bd = d2;
          bb = b;
        }
      }
      const dd = Math.sqrt(bd) || 1;
      toward(c, bb.x + ((pt.x - bb.x) / dd) * CONVOY_PLAY.shieldM, bb.y + ((pt.y - bb.y) / dd) * CONVOY_PLAY.shieldM, c.silentMps, c.cp.speedMps, out);
    } else {
      const tb = c.f.barges[tail]!;
      const lb = c.f.barges[convoyLeadIndex(c.f, c.cp)]!;
      toward(c, (tb.x + lb.x) / 2, offY - CONVOY_PLAY.shieldOffM, c.silentMps, c.cp.speedMps, out);
    }
  } else if (fled) home(c, out);
  else {
    const lb = c.f.barges[convoyLeadIndex(c.f, c.cp)]!;
    toward(c, lb.x + ux * CONVOY_PLAY.leadAheadM, offY - CONVOY_PLAY.leadOffM, c.silentMps, c.cp.speedMps, out);
  }
}
