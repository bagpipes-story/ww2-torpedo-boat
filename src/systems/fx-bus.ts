// v0.7.0 IP1b（U3「もっと派手な演出、数でも大丈夫」）: 世界の絵の火花のプール（systems/spark-fx）への口。SplashPool（水柱の飛沫・7 か所の砲口の火花）と fire-fx（火の粉）が呼ぶ。
// mission-effects の playExplosion と同じ作り（R12）: world-art が世界の作成時に登録し、破棄で null に（登録の無い間＝世界の作成前・破棄後は何もしない）。見た目だけ（論理に書かない）。
import { sfxAt, sfxGunAt } from './sfx-bus';
import type { SparkFx } from './spark-fx';

let sparks: SparkFx | null = null;
export function registerSparkFx(fx: SparkFx | null): void {
  sparks = fx;
}

/** 水柱の飛沫（SplashPool の splash から）。v0.7.1 S2: 水柱の音（命中・至近弾・爆弾＝橙は大きい水柱、外れは小さい水柱） */
export function emitSpray(x: number, y: number, hit: boolean): void {
  sparks?.spray(x, y, hit);
  sfxAt(hit ? 'splash_l' : 'splash_s', x, y);
}

/** 砲口の火花（big＝大砲は火花 4 本と硝煙、機銃は火花 2 本）。v0.7.1 S1: 機銃の発砲音、S2: 大砲の発砲音（距離の帯で近い音／遠雷） */
export function emitMuzzle(x: number, y: number, big: boolean): void {
  sparks?.muzzle(x, y, big);
  if (big) sfxGunAt(x, y);
  else sfxAt('mg', x, y);
}

/** 火災の火の粉 */
export function emitEmber(x: number, y: number): void {
  sparks?.ember(x, y);
}
