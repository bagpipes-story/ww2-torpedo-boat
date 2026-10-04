// Phaser.Game の生成のみ（CLAUDE.md §4）。設定は src/config、ロジックはシーンへ。
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SEA_COLOR } from './config/game-config';
import { BootScene } from './scenes/boot-scene';
import { MissionScene } from './scenes/mission-scene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: SEA_COLOR,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      // 端末ごとに挙動が変わらないよう固定ステップ（CLAUDE.md §7）
      fixedStep: true,
      fps: 60,
      debug: false,
    },
  },
  scene: [BootScene, MissionScene],
};

new Phaser.Game(config);
