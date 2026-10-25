// 隼艇（v0.6.6。jp_01 のハードだけ）と自艇の 25mm の手柄の分け（spec-v066 §C.4 #26・§N-8。レビュー R8）。世界の隼艇（systems/gunboat）が 1 個持ち、PtSquadron が書き、
// pt-telemetry（HUD の「命中 計 N」は自艇の分）と Result（S5 の隼艇の行・自艇の砲の行）が読む。命中・制圧・出来事は隼艇の砲の段の前後の差（増えるだけなので差で正しい）、
// 撃退・撃沈は PT ごとに最後の結末を決めた砲（fateBy。撃退の後に別の砲が沈めたら沈めた砲で上書き）を今の結末で数える＝自艇の分 + 隼艇の分 = 隊の数（ptResult の retired・sunk）。
// 差で数えると、撃退された PT が航過のまま別の砲に沈められた夜に自艇の撃退が「隊 0 − 隼艇 1 = −1」になる（模擬 core/convoy-sim-gunboat と同じ数え）。Phaser を import しない。確保は出撃時と終了時だけ。
import { FATE_BY_GUNBOAT } from '../core/convoy-sim-gunboat';
import { PT_FATE_NONE, PT_FATE_SUNK, type PtSection } from '../core/pt-boats';

export { FATE_BY_GUNBOAT, FATE_BY_PLAYER } from '../core/convoy-sim-gunboat';

export interface GunboatCredit {
  /** 隼艇の 25mm の PT への命中・制圧（砲の段の前後の q.gunHits・q.suppressions の差の和） */
  hits: number;
  suppressions: number;
  /** 隼艇の砲が最後に起こした 13mm／25mm の出来事の q.gunEventSeq（0 は無し。2 行目の「隼艇 撃退！」の元） */
  eventSeq: number;
  /** PT ごとに最後の結末を決めた砲（0 結末なし・FATE_BY_PLAYER 自艇・FATE_BY_GUNBOAT 隼艇。結末が変わった命中の砲が書く） */
  readonly fateBy: Int8Array;
}

/** 出撃時に 1 回（ptCount は米PT の隻数） */
export function createGunboatCredit(ptCount: number): GunboatCredit {
  return { hits: 0, suppressions: 0, eventSeq: 0, fateBy: new Int8Array(ptCount) };
}

/** 隼艇の砲の段の後（hits0・supp0・ev0 は段の前の q.gunHits・q.suppressions・q.gunEventSeq）: 増えた分を隼艇の分に。確保なし */
export function noteGunboatGun(cr: GunboatCredit, q: PtSection, hits0: number, supp0: number, ev0: number): void {
  cr.hits += q.gunHits - hits0;
  cr.suppressions += q.suppressions - supp0;
  if (q.gunEventSeq !== ev0) cr.eventSeq = q.gunEventSeq;
}

/** 隼艇の分の撃退・撃沈（終了時に 1 回）: 最後の結末を決めた砲が隼艇の PT を今の結末で（沈んでいれば撃沈、ほかの結末は撃退） */
export function gunboatFates(q: PtSection, cr: GunboatCredit): { retired: number; sunk: number } {
  let retired = 0;
  let sunk = 0;
  for (let i = 0; i < q.boats.length; i++) {
    if (cr.fateBy[i] !== FATE_BY_GUNBOAT) continue;
    const f = q.boats[i]!.fate;
    if (f === PT_FATE_SUNK) sunk++;
    else if (f !== PT_FATE_NONE) retired++;
  }
  return { retired, sunk };
}
