// v0.6.8 S3（spec-v068 §1.1 D7・§3.3）: PC のキー（systems/keyboard-input。Phaser のキーなので文の pin）: Space は魚雷 1 本（fireTap）だけ、
// G は押している間の機銃（gunHeld）。魚雷と機銃は全任務で両方使えるので 1 つのキーで両方を押さない（v0.6.7 の Space は両方だった）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('../src/systems/keyboard-input.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('キー: Space＝魚雷・G＝機銃', () => {
  it('Space を押した瞬間は fireTap だけ（gunHeld は書かない）', () => {
    expect(src).toContain('if (Phaser.Input.Keyboard.JustDown(k.space)) this.input.fireTap = true;');
    expect(src).not.toMatch(/k\.space[\s\S]{0,80}gunHeld/);
  });
  it('G は KeyCodes.G で、押した瞬間に gunHeld、上がれば（フォーカスを失って JustUp が来なくても）自分が立てた gunHeld を戻す', () => {
    expect(src).toContain('g: Phaser.Input.Keyboard.KeyCodes.G,');
    expect(src).toMatch(/JustDown\(k\.g\)\) \{\s*this\.input\.gunHeld = true;\s*this\.kbGun = true;/);
    expect(src).toMatch(/\(Phaser\.Input\.Keyboard\.JustUp\(k\.g\) \|\| !k\.g\.isDown\) && this\.kbGun\) \{\s*this\.input\.gunHeld = false;/);
    expect(src.split('gunHeld = true').length).toBe(2);
  });
});
