// Phaser の GameConfig（CLAUDE.md §4: Phaser設定は src/config、main.ts は Phaser.Game 生成のみ）。
import Phaser from 'phaser';
import { BootScene } from '../scenes/boot-scene';
import { HudScene } from '../scenes/hud-scene';
import { MissionScene } from '../scenes/mission-scene';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SEA_COLOR } from './game-config';

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  // 描画解像度 = 論理解像度 × min(DPR, 2)（CLAUDE.md §7）。各シーンのカメラが RENDER_SCALE 倍ズームして論理座標を保つ
  width: GAME_WIDTH * RENDER_SCALE,
  height: GAME_HEIGHT * RENDER_SCALE,
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
  scene: [BootScene, MissionScene, HudScene],
};
