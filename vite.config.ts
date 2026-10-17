// docs/snippets/vite.config.ts 準拠（v0.1.1）
// - base は GitHub Pages のサブパス（Actions が VITE_BASE=/ww2-torpedo-boat/ を渡す）。ローカルや他ホストでは '/'。
// - ビルド番号（ブランチ@コミット）を import.meta.env.VITE_BUILD_LABEL で参照できるようにする。
//   iPhone でどのビルドを見ているか迷わないための仕組み（docs/04 参照）。
// - PWA（v0.5.1）: ビルドの最後に、出力したファイルの一覧を事前キャッシュにした sw.js を書く（src/pwa/service-worker.ts）。
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { serviceWorkerSource } from './src/pwa/service-worker';

const sha = (process.env.VITE_BUILD_SHA ?? 'local').slice(0, 7);
const ref = process.env.VITE_BUILD_REF ?? 'local';
const buildTime = new Date().toISOString();

/** dir の下のファイルを、dir からの相対パス（区切りは /）で並べる */
function listFiles(dir: string, root: string = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, root));
    else out.push(relative(root, p).split(sep).join('/'));
  }
  return out;
}

/** 出力ディレクトリ（public のコピー込み）の全ファイルを事前キャッシュにした sw.js を書く。ビルド番号と時刻で版が変わる */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'night-hunters-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .filter((f) => f !== 'sw.js')
        .sort();
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(`${ref}@${sha} ${buildTime}`, files));
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: {
    'import.meta.env.VITE_BUILD_LABEL': JSON.stringify(`${ref}@${sha}`),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
  },
  plugins: [serviceWorker()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    host: true, // PCで動かす場合だけ使う。iPhone完結の運用では使わない
  },
});
