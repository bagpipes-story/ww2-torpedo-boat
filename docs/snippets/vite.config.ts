// 雛形: v0.1.1 でプロジェクト直下に置く vite.config.ts
// - base は GitHub Pages のサブパス（Actions が VITE_BASE=/ww2-torpedo-boat/ を渡す）。ローカルや他ホストでは '/'。
// - ビルド番号（ブランチ@コミット）を import.meta.env.VITE_BUILD_LABEL で参照できるようにする。
//   iPhone でどのビルドを見ているか迷わないための仕組み（docs/04 参照）。
import { defineConfig } from 'vite';

const sha = (process.env.VITE_BUILD_SHA ?? 'local').slice(0, 7);
const ref = process.env.VITE_BUILD_REF ?? 'local';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  define: {
    'import.meta.env.VITE_BUILD_LABEL': JSON.stringify(`${ref}@${sha}`),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    host: true, // PCで動かす場合だけ使う。iPhone完結の運用では使わない
  },
});
