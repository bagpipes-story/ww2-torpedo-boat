// Service Worker の登録（v0.5.1。PWA）。index.html から main.ts と別に読む（main.ts は Phaser.Game の生成のみ。CLAUDE.md §4）。
// 本番ビルドだけ（npm run dev では登録しない）。URL に ?nosw があれば、登録を外して Night Hunters のキャッシュを消すだけ（困ったとき用。docs/04 §5）。
import { SW_CACHE_PREFIX } from './service-worker';

async function clearServiceWorker(): Promise<void> {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith(SW_CACHE_PREFIX)).map((k) => caches.delete(k)));
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (new URLSearchParams(window.location.search).has('nosw')) {
    void clearServiceWorker().catch(() => undefined);
    return;
  }
  // 起動（Phaser の読み込み）を邪魔しないよう load の後に。失敗しても遊べる（オフラインにならないだけ）
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        // 新しいビルドの sw.js を自分で確かめに行く（ブラウザ任せだと再読込しても確認されないことがあった。iOS のホーム画面のアプリは前面に戻るだけのことが多い）。
        // ページ本体はネットワーク優先なのでオンラインなら常に最新。これはオフライン用のキャッシュを最新のビルドへ入れ替えるため
        const check = (): void => void reg.update().catch(() => undefined);
        check();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch(() => undefined);
  });
}

registerServiceWorker();
