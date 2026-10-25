// 夜の哨戒機（v0.6.7。jp_02「孤島の哨戒」。spec-v067 §D.5）の Result の 2 行: 捜索・隠れた・見つかった回数と、夜の爆撃の爆弾・命中・投下から転舵の秒。
// 夜明けの 4 機の空襲は今の夜明けの行（ui/dawn-lines の dawnResultLine）が数える（ここは夜の出撃だけ）。Phaser も DOM を読む config も使わない（文を組むだけ）。
import type { PatrolResult } from './result-types';

/** 「投下から転舵 …」に出す自艇を狙った夜の爆弾の数（最初の N 発。夜明けの行と同じ） */
const PATROL_RESULT_DODGE_SHOWN = 8;

/** 1 行目: 「夜の哨戒機: 捜索 5 回（航跡で 3 回） ・ 隠れた 3 回 ・ 見つかった 1 回（レーダーの後）」。レーダーの後に見つからなければ「 ・ レーダーの後は見つからなかった」 */
export function patrolSearchResultJa(r: PatrolResult): string {
  const found = r.findsVisual > 0 ? `見つかった ${r.findsVisual} 回（レーダーの後）` : 'レーダーの後は見つからなかった';
  return `夜の哨戒機: 捜索 ${r.passes} 回（航跡で ${r.passesWake} 回） ・ 隠れた ${r.hides} 回 ・ ${found}`;
}

/** 2 行目: 「夜の爆撃: 8 発 命中 2（HP −70） ・ 投下から転舵 0.4／0.6／—／0.3 秒」（— は転舵なし。命中 0 なら HP は付けない）。爆撃が無ければ「夜の爆撃: なし」 */
export function patrolBombResultJa(r: PatrolResult): string {
  if (r.bombs === 0) return '夜の爆撃: なし';
  const hp = r.hits > 0 ? `（HP −${Math.ceil(r.damage)}）` : '';
  const shown = r.dodgeS.slice(0, PATROL_RESULT_DODGE_SHOWN);
  const dodge = shown.length > 0 ? ` ・ 投下から転舵 ${shown.map((x) => (Number.isNaN(x) ? '—' : x.toFixed(1))).join('／')} 秒` : '';
  return `夜の爆撃: ${r.bombs} 発 命中 ${r.hits}${hp}${dodge}`;
}
