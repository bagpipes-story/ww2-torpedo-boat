// 夜明けの海の明るさ（v0.6.1。spec §8.6）: カメラの背景色を夜の SEA_COLOR から昼の DAY_SEA_COLOR へ SEA_LIGHT_STEPS + 1 色で変える。
// §7: 色の整数は constructor で 1 回だけ作り、update は段が変わったときだけ setBackgroundColor（任務中に最大 16 回）。毎フレーム塗り直さない。
// 段（0〜steps）は core/dawn-air の seaLightStep。段 0 では何もしない（夜は v0.6.0 と同じ見た目）。
import type Phaser from 'phaser';
import { DAY_SEA_COLOR, SEA_COLOR, SEA_LIGHT_STEPS } from '../config/dawn-config';

function rgbOf(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export class SeaLight {
  private readonly colors: number[] = [];
  private step = 0;

  constructor(private readonly camera: Phaser.Cameras.Scene2D.Camera) {
    const a = rgbOf(SEA_COLOR);
    const b = rgbOf(DAY_SEA_COLOR);
    for (let k = 0; k <= SEA_LIGHT_STEPS; k++) {
      const f = k / SEA_LIGHT_STEPS;
      const c = (i: number): number => Math.round(a[i]! + (b[i]! - a[i]!) * f);
      this.colors.push((c(0) << 16) | (c(1) << 8) | c(2));
    }
  }

  /** 段（0〜SEA_LIGHT_STEPS）が変わったときだけ背景色を変える */
  update(step: number): void {
    const k = step < 0 ? 0 : step > SEA_LIGHT_STEPS ? SEA_LIGHT_STEPS : step;
    if (k === this.step) return;
    this.step = k;
    this.camera.setBackgroundColor(this.colors[k]!);
  }

  /** 明るくしていたら透明（Phaser の既定）に戻す（「もう一度」で同じカメラが残っても夜から始まる） */
  destroy(): void {
    if (this.step === 0) return;
    this.step = 0;
    this.camera.setBackgroundColor();
  }
}
