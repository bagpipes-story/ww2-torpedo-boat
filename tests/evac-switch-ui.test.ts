// v0.6.11 S5（spec-v0611-r2 §9・§10.4・r2 L6・L8・L13）: ［切替］のボタンとキー・端の印・左上の乗員の「-N」・帰投の輪（ソースの pin と config/hud-layout-config の値）。
// ［切替］は右端の縦一列の識別の段（y 404）に jp_03 だけ（SKILL_ORDER は変えない＝ほかの任務の置き方は 1 px も変わらない）、字は並びの次の隊「切替」「第4隊」の 2 行（v0.6.11 S8。S5〜S7 は「切替 4」）、移る先が無い・決着の後は灰色の「切替」。
// ボタンの押下とキー（Tab）は InputState.switchTap を立てるだけ（世界が消費する。世界と模擬の突き合わせの world-vs-sim はこのボタンを押して入れる）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { playableMissionIds } from '../src/config/campaign-data';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { SKILL_ORDER, panelLayout, skillColumnX, skillSlotY } from '../src/config/hud-layout-config';
import { G_HIDDEN, G_UNDERWAY } from '../src/core/evac-data';
import { evacNextSwitch, evacSettle } from '../src/core/evac-seat';
import { createEvacTelemetry } from '../src/core/evac-telemetry';
import { initEvacTelemetry, refreshEvacTelemetry } from '../src/systems/evac-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { miniWorld } from './evac-world-kit';

const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const src = (p: string): string => strip(readFileSync(p, 'utf8'));
const WIDTHS = [1280, 1344, 1560, 1584];

describe('置き方（config/hud-layout-config）', () => {
  it('識別の段に［切替］は has.switch かつ識別の無い時だけ。ほかの組（switch なし・false）は今の置き方と同じ（1 px も変わらない）', () => {
    for (const W of WIDTHS)
      for (const smoke of [false, true])
        for (const identify of [false, true]) {
          const before = panelLayout(W, { smoke, identify });
          expect(panelLayout(W, { smoke, identify, switch: false })).toEqual(before);
          const sw = panelLayout(W, { smoke, identify, switch: true });
          if (identify) expect(sw).toEqual(before);
          else {
            expect(sw.skills.slice(0, -1)).toEqual(before.skills);
            expect(sw.skills[sw.skills.length - 1]).toEqual({ kind: 'switch', label: '切替', x: skillColumnX(W), y: skillSlotY(3) });
            expect({ ...sw, skills: before.skills }).toEqual(before);
          }
        }
    expect(SKILL_ORDER).toEqual(['smoke', 'extinguish', 'lookout', 'identify']);
    expect(skillSlotY(3)).toBe(404);
  });
  it('evac の任務は jp_03 だけ（遊べる 8 任務と jp_03 の世界）。jp_03 の艇は煙幕なし・味方機なし＝識別の段は空き（V-E11）', () => {
    const ids = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard'), 'jp_03'];
    for (const id of ids)
      for (const hard of [false, true]) {
        const s = buildWorldSetup(gameData, id, { hard });
        expect(s.evac !== null && s.evac !== undefined, `${id}${hard ? ' hard' : ''}`).toBe(id === 'jp_03');
      }
    const m = getPrototypeMission(gameData, 'jp_03');
    expect(buildWorldSetup(gameData, 'jp_03').friendly).toBeNull();
    expect(m.playerBoatId).toBe('jp_t38');
  });
});

describe('ボタン・キー・HUD の配線（ソース）', () => {
  it('ui/weapon-panel: 識別の段の種類 switch だけ［切替］を作り、押下で switchTap。字は移る先が変わったときだけ「切替」「第N隊」／灰色の「切替」。一時停止の取り消しと破棄にも入る', () => {
    const p = src('src/ui/weapon-panel.ts');
    expect(p).toContain("else if (s.kind === 'switch') this.switchButton = new HoldButton(scene, s.x, s.y, s.label, { onDown: () => (input.switchTap = true) }");
    expect(p).toContain('if (this.switchButton && t.evac.nextSwitch !== this.lastSwitch) {');
    expect(p).toContain("this.switchButton.setLabel(t.evac.nextSwitch >= 0 ? `切替\\n${t.evac.groupLabels[t.evac.nextSwitch]}` : '切替');");
    expect(p).toContain('this.switchButton.setEnabled(t.evac.nextSwitch >= 0);');
    expect(p).toContain('this.identifyButton, this.switchButton];');
    expect(p).toContain('this.switchButton?.destroy();');
  });
  it('systems/keyboard-input: Tab で switchTap（押した瞬間だけ）。Tab は空襲下の退避の任務だけ登録する（v0.6.11 S8: ほかの任務はブラウザの Tab を捕まえない）', () => {
    const k = src('src/systems/keyboard-input.ts');
    expect(k).not.toContain('tab: Phaser.Input.Keyboard.KeyCodes.TAB,');
    expect(k).toContain('this.tab = kb && withSwitch ? kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB) : null;');
    expect(k).toContain('if (this.tab && Phaser.Input.Keyboard.JustDown(this.tab)) this.input.switchTap = true;');
    expect(src('src/scenes/hud-scene.ts')).toContain('this.keyboard = new KeyboardInput(this, input, this.telemetry.evac.enabled);');
  });
  it('ui/hud-markers: evac の任務は帰投の印を作らず端の矢印（ui/evac-markers）。scenes/mission-scene: 帰投地点の輪と「帰投地点」の字も作らない（隠れ場所の輪が代わり。r2 L8）', () => {
    const h = src('src/ui/hud-markers.ts');
    expect(h).toContain('if (telemetry.evac.enabled) this.evacMarkers = new EvacEdgeMarkers(scene, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP);');
    expect(h).toContain("else this.homeMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: '帰投',");
    expect(h).toContain('this.evacMarkers?.refresh(telemetry);');
    expect(src('src/scenes/mission-scene.ts')).toContain('this.returnView = w.evac ? undefined : new ReturnPointView(this, w.returnPoint);');
    const f = src('src/systems/evac-flights.ts');
    expect(f).toContain('marks.update(w.stepTimeS, cam.zoom / RENDER_SCALE);');
    // 端の矢印はカメラの本当の中心から（jp_03 の小さな海は見張りのズームでカメラが縁に止まる。ヘッドレスの画面写しで見つけた）
    expect(f).toContain('evac.camX = cam.midPoint.x;');
    expect(src('src/systems/evac-telemetry.ts')).toContain('t.camDx = ev.camX - seat.x;');
    // 距離は座席から（原点のずれ ox・oy を渡し、EdgeMarker が画面の外に出す時だけ平方根。v0.6.11 S8）
    expect(src('src/ui/evac-markers.ts')).toContain('m.refresh(dx - ox, dy - oy, true, t, undefined, true, ox, oy);');
    expect(src('src/ui/evac-markers.ts')).not.toMatch(/Math\.(sqrt|hypot)/);
    expect(src('src/ui/edge-marker.ts')).toContain('const dist = distM ?? Math.hypot(dx + distOx, dy + distOy);');
  });
  it('ui/hp-bar: 座席へ入れたフレーム（切替・交代・自動の切替）は乗員の前回値を今の値に合わせ「-N」を出さない（r2 L6）。減りの判定より先', () => {
    const h = src('src/ui/hp-bar.ts');
    const a = h.indexOf('if (t.evac.seatSeq !== this.lastSeatSeq) {');
    const b = h.indexOf('this.lastCrewAlive = t.crewAlive;', a);
    const c = h.indexOf('if (this.lastCrewAlive >= 0 && t.crewAlive < this.lastCrewAlive) {');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(createEvacTelemetry().seatSeq).toBe(0); // evac の無い任務は 0 のまま（前回値 0 と同じ＝今までの乗員の表示）
  });
  it('ui/boat-hud: 3 行目は evac の任務だけ隊の行（新しい Text は作らない＝r2 H4）。ui/mission-line は ui/special-line（差し引き 0 行）', () => {
    const b = src('src/ui/boat-hud.ts');
    expect(b).toContain('const est = t.evac.enabled ? evacStatusKey(t.evac) : -1;');
    expect(b).toContain('this.statusText.setText(evacStatusLine(t.evac)).setColor(HUD_COLOR);');
    expect(b.split('.text(').length - 1).toBe(4); // 速力・段・針路・3 行目（v0.6.10 と同じ 4 つ）
    expect(readFileSync('src/ui/mission-line.ts', 'utf8').split('\n').length - 1).toBe(297);
    expect(src('src/ui/mission-line.ts')).toContain('specialLine(t, mode, this.ptClock)');
  });
});

describe('［切替］の字（テレメトリの nextSwitch）', () => {
  it('並びの次の隊（sq.order を書かない並びで見る）。決着の後は −1（灰色）', () => {
    const w = miniWorld(1);
    const t = initEvacTelemetry(w);
    const sq = w.evac.sq;
    const before = [Array.from(sq.order), sq.orderLen];
    refreshEvacTelemetry(t, w);
    expect([Array.from(sq.order), sq.orderLen]).toEqual(before);
    const scratch = new Int32Array(sq.groups.length);
    expect(t.nextSwitch).toBe(evacNextSwitch(sq, scratch));
    expect(t.nextSwitch).toBeGreaterThanOrEqual(0);
    // 隠れた隊も並びに入る（狙われている → 外 → 上げている → 隠れている）
    sq.groups[1]!.phase = G_HIDDEN;
    for (const g of sq.groups) if (g.index !== 1) g.phase = G_UNDERWAY;
    refreshEvacTelemetry(t, w);
    expect(t.nextSwitch).toBe(2);
    evacSettle(sq);
    refreshEvacTelemetry(t, w);
    expect(t.nextSwitch).toBe(-1);
  });
});
