// Phaser.Game の生成のみ（CLAUDE.md §4）。設定は src/config/phaser-config.ts。
import Phaser from 'phaser';
import { phaserConfig } from './config/phaser-config';

const game = new Phaser.Game(phaserConfig);

// URL に ?debug を付けたときだけ、自動テスト（ヘッドレス Chromium）や実機デバッグのためにゲームを公開する。通常の Pages URL では何もしない
if (typeof window !== 'undefined' && window.location.search.includes('debug')) {
  (window as unknown as { __game?: Phaser.Game }).__game = game;
}
