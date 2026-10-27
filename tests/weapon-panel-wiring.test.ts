// 右側の 2 列のパネルの配線（v0.6.8 S4。spec-v068 §3.3・§4.1〜4.3）: Phaser の部分はソースで見る（ui-config・game-config は DOM を読むので node で import しない）。
// パネルは config/hud-layout-config の panelLayout から作る（主兵装 = 右下の角。jp_02 の none は機銃）・魚雷は積んでいる本数と撃てるか・機銃は橙のテクスチャで 600 ms 待つ・
// 扇の当たりは 638〜720・技能の中身は v0.6.7 のまま・一時停止の並び・速力と機関の表示の右端 W − 312・端の印の余白 352・つまむ帯 W − 304 とボタンの上を数えない・
// Boot は魚雷のボタンの後に機銃のボタンを作る。値（列・段・矩形）は tests/hud-layout。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GUN_FIRING_ALPHA } from '../src/config/arms-config';
import { SPREAD_HIT_TOP_Y, SPREAD_TOP_Y } from '../src/config/hud-layout-config';

const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const src = (p: string): string => strip(readFileSync(p, 'utf8'));

describe('ui/weapon-panel', () => {
  const panel = src('src/ui/weapon-panel.ts');
  it('置き方は panelLayout（主兵装が魚雷なら魚雷が角、ほか（guns・none）は機銃が角）・煙幕は艇・識別は今夜の味方機', () => {
    expect(panel).toContain("const torpedoPrimary = mission.mainWeapon === 'torpedo';");
    expect(panel).toContain("const L = panelLayout(GAME_WIDTH, torpedoPrimary ? 'torpedo' : 'guns', { smoke: hasSmoke, identify: telemetry.friendlyEnabled });");
    expect(panel).toContain('const hasSmoke = getBoatSmokeParams(data, mission.playerBoatId) !== null;');
  });
  it('魚雷と扇は艇が積んでいれば（全任務）、機銃は艇に砲があれば（全任務）。副兵装は縮めて小さい文字', () => {
    expect(panel).toContain('const loadout = getLoadout(data, mission);');
    expect(panel).toContain('if (loadout.torpedoes > 0) {');
    expect(panel).toContain('new TorpedoButton(scene, input, spread, L.torpedo.x, L.torpedo.y, torpedoPrimary ? 1 : SECONDARY_SCALE, () => this.cue.local(EV_TORP_EMPTY, scene.time.now), torpedoPrimary ? HUD_FONT_BUTTON_PX : SECONDARY_FONT_PX);');
    expect(panel).toContain('new SpreadButton(scene, L.spread.x, L.spread.y, L.spread.w, spread, launch.salvo_spacing_deg, launch.salvo_spacing_choices_deg);');
    expect(panel).toContain('if (loadout.gun !== null) {');
    expect(panel).toContain('TEXTURE_KEYS.gunButton,');
    expect(panel).toContain('torpedoPrimary ? SECONDARY_SCALE : 1,');
    expect(panel).toContain('{ armMs: TORPEDO_BUTTON_ARM_MS, fontPx: torpedoPrimary ? SECONDARY_FONT_PX : HUD_FONT_BUTTON_PX },');
    expect(panel).toContain('{ onDown: () => (input.gunHeld = true), onUp: () => (input.gunHeld = false) },');
  });
  it('毎フレーム: 魚雷は積んでいる本数（torpedoesLeft ではない）と撃てるか、機銃は弾倉交換（主兵装と新しい道の大きい方）と撃っている間の色', () => {
    expect(panel).toContain('this.torpedoButton?.setRemaining(a.torpedoesAboard);');
    expect(panel).toContain('this.torpedoButton?.setUsable(a.torpedoUsable);');
    expect(panel).not.toContain('torpedoesLeft');
    expect(panel).toContain('const reloadN = Math.max(gunButtonReloadN(t), a.reloadN);');
    expect(panel).toContain('this.gunButton.setAlphaOverride(a.gunFiring ? GUN_FIRING_ALPHA : NaN);');
    expect(panel).not.toContain('this.gunButton.setTint('); // 色の掛け算は橙の輪を暗くした（レビュー ux-gun-firing-tint-darkens）
    // 撃っている間はいつもの濃さ（ROUND_BUTTON_ALPHA）より濃く＝明るく見える（掛け算の色と違って打ち消されない）
    const roundAlpha = Number(/export const ROUND_BUTTON_ALPHA = ([0-9.]+);/.exec(readFileSync('src/config/ui-config.ts', 'utf8'))?.[1]);
    expect(GUN_FIRING_ALPHA).toBeGreaterThan(roundAlpha + 0.3);
    expect(GUN_FIRING_ALPHA).toBeLessThanOrEqual(1);
    expect(panel).toContain('this.cue.update(a, nowMs, this.torpedoHeld);');
  });
  it('技能の中身は v0.6.7 と同じ（煙幕は離すと・消火と見張りは押している間・識別は押下）。一時停止の並びも同じ', () => {
    expect(panel).toContain("if (s.kind === 'smoke') this.smokeButton = new HoldButton(scene, s.x, s.y, s.label, { onUp: () => (input.smokeTap = true) });");
    expect(panel).toContain("this.extinguishButton = new HoldButton(scene, s.x, s.y, s.label, { onDown: () => (input.extinguishHeld = true), onUp: () => (input.extinguishHeld = false) });");
    expect(panel).toContain("this.lookoutButton = new HoldButton(scene, s.x, s.y, s.label, { onDown: () => (input.lookout = true), onUp: () => (input.lookout = false) });");
    expect(panel).toContain('this.identifyButton = new HoldButton(scene, s.x, s.y, s.label, { onDown: () => (input.identifyTap = true) });');
    expect(panel).toContain('return [this.torpedoButton, this.spreadButton, this.gunButton, this.smokeButton, this.extinguishButton, this.lookoutButton, this.identifyButton];');
  });
});

describe('ボタン', () => {
  it('魚雷: 置き場所と倍率は呼ぶ側・撃てない間は受けない・0 本は揺れて onEmpty・濃さは 1 か所（applyAlpha）', () => {
    const tb = src('src/systems/torpedo-button.ts');
    expect(tb).toContain('.setScale(sizeScale / RENDER_SCALE)');
    expect(tb).toContain('this.button.setScale((TORPEDO_BUTTON_PRESSED_SCALE * this.sizeScale) / RENDER_SCALE);');
    expect(tb).toContain("cy - TORPEDO_BUTTON_RADIUS * sizeScale - TORPEDO_SPREAD_LABEL_GAP, '', hudTextStyle(HUD_FONT_BUTTON_PX)");
    const down = tb.slice(tb.indexOf('private onDown('), tb.indexOf('private onUp('));
    expect(down.indexOf('if (!this.armed || this.pointerId !== -1) return;')).toBeGreaterThan(0);
    expect(down.indexOf('if (this.lastRemaining <= 0) {')).toBeGreaterThan(down.indexOf('if (!this.armed'));
    expect(down.indexOf('if (!this.usable) return;')).toBeGreaterThan(down.indexOf('if (this.lastRemaining <= 0) {'));
    expect(tb.match(/\.setAlpha\(/g)?.length).toBe(2); // 作ったときと applyAlpha の 1 か所だけ
  });
  it('扇: 幅は呼ぶ側・当たりは見た目の上端から 4 px 上〜枠の下端（638〜720）', () => {
    const sb = src('src/systems/spread-button.ts');
    expect(sb).toContain('const hit = new Phaser.Geom.Rectangle(0, SPREAD_HIT_TOP_Y - SPREAD_TOP_Y, w, GAME_HEIGHT - SPREAD_HIT_TOP_Y);');
    expect(sb).toContain('.setInteractive(hit, Phaser.Geom.Rectangle.Contains);');
    expect([SPREAD_HIT_TOP_Y - SPREAD_TOP_Y, 720 - SPREAD_HIT_TOP_Y]).toEqual([-4, 82]);
  });
  it('押し続けのボタン: armMs の間は押下を受けない（機銃。一時停止などは今まで通りすぐ）', () => {
    const hb = src('src/systems/hold-button.ts');
    expect(hb).toContain('this.armed = opts.armMs === undefined;');
    expect(hb).toContain('if (!this.armed || this.pointerId !== -1) return;');
    expect(hb).toContain('this.armTimer?.remove(false);');
  });
  it('つまむ: ボタンの上で始まった指は数えない（over）・右端は W − 304', () => {
    const pz = src('src/systems/pinch-zoom.ts');
    const down = pz.slice(pz.indexOf('private onDown('));
    expect(down.indexOf('if (over.length > 0) return;')).toBeGreaterThan(0);
    expect(down.indexOf('if (over.length > 0) return;')).toBeLessThan(down.indexOf('getWorldPoint'));
    expect(down).toContain('if (v.x < GAME_WIDTH / 2 || v.x >= PINCH_BUTTON_COLUMN_X) return;');
  });
});

describe('右側の 2 列に合わせた値（ui-config・速力・機関・端の印・Boot）', () => {
  const ui = readFileSync('src/config/ui-config.ts', 'utf8');
  it('ui-config はパネルの関数から（W − 304・352・W − 312）。v0.6.7 の 1 列の y は消した。300 行台の前半のまま', () => {
    const s = strip(ui);
    expect(s).toContain('export const PINCH_BUTTON_COLUMN_X = pinchMaxX(GAME_WIDTH);');
    expect(s).toContain('export const TARGET_MARKER_RIGHT_MARGIN = markerRightMargin(GAME_WIDTH);');
    expect(s).toContain('export const SPEED_HUD_RIGHT_X = speedHudRightX(GAME_WIDTH);');
    for (const k of ['TORPEDO_BUTTON_Y', 'SPREAD_BUTTON_Y', 'SPREAD_BUTTON_GAP', 'LOOKOUT_BUTTON_Y', 'IDENTIFY_BUTTON_Y', 'SPREAD_BUTTON_W', 'ROUND_BUTTON_GAP']) expect(s, k).not.toContain(`export const ${k} `);
    expect(ui.split('\n').length).toBeLessThanOrEqual(309);
  });
  it('速力・機関の表示の右端と、夜の哨戒機の矢印の避ける角は SPEED_HUD_RIGHT_X から', () => {
    expect(src('src/ui/boat-hud.ts')).toContain('const right = SPEED_HUD_RIGHT_X;');
    expect(src('src/ui/engine-hud.ts')).toContain('const GAUGE_RIGHT_X = SPEED_HUD_RIGHT_X;');
    expect(src('src/ui/hud-markers.ts')).toContain('const SPEED_HUD_KEEP_LEFT = SPEED_HUD_RIGHT_X - RUDDER_BAR_HALF_WIDTH * 2 - HUD_FONT_MARKER_PX * 4;');
  });
  it('Boot: 機銃のボタンのテクスチャは魚雷のボタンのすぐ後（1 回だけ）', () => {
    const boot = readFileSync('src/scenes/boot-scene.ts', 'utf8').replace(/\/\/[^\n]*/g, ''); // 1 行目の注釈に「data/*.json」があるので行の注釈だけ消す
    const i = boot.indexOf('generateTorpedoButtonTexture(this);');
    expect(i).toBeGreaterThan(0);
    expect(boot.slice(i).replace(/\s+/g, ' ').startsWith('generateTorpedoButtonTexture(this); generateGunButtonTexture(this);')).toBe(true);
    expect(boot.match(/generateGunButtonTexture\(this\)/g)?.length).toBe(1);
  });
  it('機銃のボタンの文字は「機銃 押し続け」（v0.6.7 までは「射撃」）', () => {
    expect(src('src/config/hunt-config.ts')).toContain("export const GUN_BUTTON_LABEL = '機銃\\n押し続け';");
  });
});
