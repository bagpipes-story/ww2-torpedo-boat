// 隊の中の「他の艦の光」（v0.7.0 IP4。実機 3 回目の後のユーザーの報告「停止してサーチライトから外れて敵が自機を見失ってるはずなのに砲撃を続行してきます」）。
// 輸送船（自分の探照灯が無い）は同じ隊の駆逐艦が艇を照らしている間か照明弾の下でだけ撃つ（v0.4.7。us_02 の transport.source）。
// その「照らしている」は艦が自分で点けた光（探照灯の扇か自分の星弾）だけ。gunnery の illuminated は他の艦の光（externalLit）も含むので、
// 2 隻以上の隊で互いの illuminated を読むと、光が消えた後も互いを true にし続けた（灯りが消えて見失っても撃ち続けた）。Phaser 非依存・確保しない。
import type { GunneryState } from './gunnery';

/** この艦が自分の光（探照灯の扇か自分の星弾）で艇を照らしている。他の艦の光・照明弾（externalLit）は含めない */
export function litByOwnLight(g: GunneryState): boolean {
  return g.light.illuminating || g.star.illuminating;
}
