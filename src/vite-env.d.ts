/// <reference types="vite/client" />

// vite.config.ts の define で注入される値（docs/snippets/vite.config.ts）
interface ImportMetaEnv {
  /** ブランチ@コミット7桁。例: claude/v0.1.1-scaffold@1a2b3c4 */
  readonly VITE_BUILD_LABEL: string;
  /** ビルド時刻 ISO8601 */
  readonly VITE_BUILD_TIME: string;
}
