// v0.7.0 IP1b（U3「もっと派手な演出、数でも大丈夫」）: 世界の絵の火花のプール（systems/spark-fx）への口。SplashPool（水柱の飛沫・7 か所の砲口の火花）と fire-fx（火の粉）が呼ぶ。
// mission-effects の playExplosion と同じ作り（R12）: world-art が世界の作成時に登録し、破棄で null に（登録の無い間＝世界の作成前・破棄後は何もしない）。見た目だけ（論理に書かない）。
import type { SparkFx } from './spark-fx';

let sparks: SparkFx | null = null;
export function registerSparkFx(fx: SparkFx | null): void {
  sparks = fx;
}

/** 水柱の飛沫（SplashPool の splash から） */
export function emitSpray(x: number, y: number, hit: boolean): void {
  sparks?.spray(x, y, hit);
}

/** 砲口の火花（big＝大砲は火花 4 本と硝煙、機銃は火花 2 本） */
export function emitMuzzle(x: number, y: number, big: boolean): void {
  sparks?.muzzle(x, y, big);
}

/** 火災の火の粉 */
export function emitEmber(x: number, y: number): void {
  sparks?.ember(x, y);
}
