// ゲームの枠（#game）の大きさを JS で決める（v0.5.1 実機 1 回目。CLAUDE.md §7 iOS: 100vh/100dvh ではなく window.innerHeight）。
// 実機（iPhone のホーム画面のアプリ）で、CSS の 100dvh が起動直後に画面より大きく出て、16:9 の画面が上下にはみ出した
// （スクショ: 左右は safe-area の 59 px で正しく、枠の幅 734 px いっぱい → 高さ 413 px が画面 393 px からはみ出していた）。
// → 枠は position: fixed にして、innerWidth/innerHeight と safe-area（CSS の env() を小さな要素で測る）から左上と大きさを入れる（core/screen.ts）。
// iOS は起動直後と回転の途中に落ち着く前の値を返すので、起動時・回転時に少し間を置いて何度か測り直す。Phaser の FIT は 0.5 秒ごとに親の大きさを見て合わせ直す。
// 作るのは起動時の 1 回だけ（§7: 毎フレームは触らない。測り直しは resize・回転のイベントのときだけ）。
import { landscapeSize, screenBoxFor, type Insets } from '../core/screen';

/** 起動時と回転の後に測り直す時刻（ms） */
const REFIT_DELAYS_MS = [0, 100, 250, 500, 1000, 2000] as const;

/** safe-area を測る。env() を padding に入れた見えない要素の計算後の値（読めなければ 0） */
function readInsets(): Insets {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.documentElement.appendChild(el);
  const cs = getComputedStyle(el);
  const px = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const ins = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  el.remove();
  return ins;
}

function fit(el: HTMLElement): void {
  const b = screenBoxFor(window.innerWidth, window.innerHeight, readInsets());
  el.style.left = `${b.left}px`;
  el.style.top = `${b.top}px`;
  el.style.width = `${b.width}px`;
  el.style.height = `${b.height}px`;
}

function burst(el: HTMLElement): void {
  for (const ms of REFIT_DELAYS_MS) window.setTimeout(() => fit(el), ms);
}

/**
 * 枠を今の画面に合わせ、以後は resize・回転で合わせ直す。戻り値は横持ちの枠の大きさ（CSS px。論理幅と描画倍率を決める）。
 * window が無い（テスト）・#game が無いなら null
 */
export function startScreenFit(): { width: number; height: number } | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const el = document.getElementById('game');
  if (!el) return null;
  fit(el);
  burst(el);
  window.addEventListener('resize', () => fit(el));
  window.addEventListener('orientationchange', () => burst(el));
  window.visualViewport?.addEventListener('resize', () => fit(el));
  return landscapeSize(window.innerWidth, window.innerHeight, readInsets());
}
