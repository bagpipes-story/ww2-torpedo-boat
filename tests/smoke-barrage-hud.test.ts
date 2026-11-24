// v0.8.4 2 行目「煙の中へ乱射されている」（ui/barrage-lines。モード 45・旗 8192。史実モードの煙幕への乱射の弾が自艇から 150 m の内に落ちた時）: 時計（数が増えたら始め、出ている間に増えたら
// 4 秒を数え直す・通し番号は変えない）・上の行に隠れている間は待つ・special-line と mission-line-keys の配線・テレメトリの配線・音の層は読まない。
import { describe, expect, it } from 'vitest';
import { SMOKE_BARRAGE_EVENT_SHOW_MS, SMOKE_BARRAGE_HUD_NEAR_M } from '../src/config/barrage-hud-config';
import { HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { BARRAGE_LINE, BARRAGE_LINE_JA } from '../src/ui/barrage-lines';
import { composeLineKeys, createLineKeys } from '../src/ui/mission-line-keys';
import { MISSION_BARRAGE_EVENT, MISSION_RADAR_EVENT, MODE_FLAG_BARRAGE_EVENT, MODE_FLAG_RADAR_EVENT, missionMode } from '../src/ui/mission-mode';
import { specialLine } from '../src/ui/special-line';
import { StraitLineClock } from '../src/ui/strait-line-clock';
import { code } from './core-rules-kit';
import { SFX } from './sfx-rules-kit';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';

const frame = (c: StraitLineClock, n: number, ms: number): number => {
  const t = tele({}, { smokeBarrage: n });
  const f = c.flags(t, ms);
  const mode = missionMode(t, 0, f);
  c.shown(mode, ms);
  return mode;
};

describe('2 行目「煙の中へ乱射されている」（ui/barrage-lines）', () => {
  it('文・警告の色・22 px で 840 px の内。近いの距離は 150 m・出す秒は 4 秒（見せ方の定数）', () => {
    expect(BARRAGE_LINE_JA).toBe('煙の中へ乱射されている');
    expect(BARRAGE_LINE).toEqual({ text: BARRAGE_LINE_JA, color: HUD_COLOR_WARN });
    expect(textWidthPx(BARRAGE_LINE_JA, 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
    expect([SMOKE_BARRAGE_HUD_NEAR_M, SMOKE_BARRAGE_EVENT_SHOW_MS]).toEqual([150, 4000]);
  });
  it('数が増えたら出す。出ている間に増えれば 4 秒を数え直す（キーは同じ＝setText しない）。増えなくなって 4 秒で消え、次に増えたら新しいキー。数が 0 なら出ない', () => {
    const c = new StraitLineClock();
    let ms = 0;
    expect(frame(c, 0, ms)).not.toBe(MISSION_BARRAGE_EVENT);
    expect(c.barrage.key).toBe(0);
    expect(frame(c, 1, (ms += 16))).toBe(MISSION_BARRAGE_EVENT);
    expect(c.barrage.key).toBe(1);
    const t = tele({}, { smokeBarrage: 1 });
    expect(specialLine(t, MISSION_BARRAGE_EVENT, { landingEv: null as never, strait: c })).toEqual(BARRAGE_LINE);
    expect(composeLineKeys(createLineKeys(), t, MISSION_BARRAGE_EVENT, MODE_FLAG_BARRAGE_EVENT, -1, 0, 0, null as never, c).lKey).toBe(1);
    for (let i = 0; i < 200; i++) frame(c, 1, (ms += 16)); // 3.2 秒
    expect(frame(c, 2, (ms += 16))).toBe(MISSION_BARRAGE_EVENT); // 数え直し
    let shown = 0;
    while (frame(c, 2, (ms += 16)) === MISSION_BARRAGE_EVENT) shown += 16;
    expect(shown).toBeGreaterThanOrEqual(SMOKE_BARRAGE_EVENT_SHOW_MS - 32);
    expect(shown).toBeLessThanOrEqual(SMOKE_BARRAGE_EVENT_SHOW_MS);
    expect(c.barrage.key).toBe(1);
    expect(frame(c, 3, (ms += 16))).toBe(MISSION_BARRAGE_EVENT);
    expect(c.barrage.key).toBe(2);
  });
  it('上の行（燃料切れ）に隠れている間は数えず待つ。レーダーの出来事より上', () => {
    const c = new StraitLineClock();
    let ms = 0;
    for (let i = 0; i < 400; i++) {
      const t = tele({}, { smokeBarrage: 1, fuelEmpty: true });
      c.shown(missionMode(t, 0, c.flags(t, (ms += 16))), ms);
    }
    expect(frame(c, 1, (ms += 16))).toBe(MISSION_BARRAGE_EVENT);
    const t = tele({}, {});
    expect(missionMode(t, 0, MODE_FLAG_BARRAGE_EVENT | MODE_FLAG_RADAR_EVENT)).toBe(MISSION_BARRAGE_EVENT);
    expect(missionMode(t, 0, MODE_FLAG_RADAR_EVENT)).toBe(MISSION_RADAR_EVENT);
  });
  it('配線: 海峡の時計が barrage を持ち旗を足し shown を渡す・テレメトリは隊の数（乱射の無い世界は 0）・音の層は読まない', () => {
    const clock = code('src/ui/strait-line-clock.ts');
    expect(clock).toContain('readonly barrage = new BarrageLineClock();');
    expect(clock).toContain('this.barrage.flags(t, nowMs)');
    expect(clock).toContain('this.barrage.shown(mode, nowMs);');
    expect(code('src/ui/special-line.ts')).toContain('if (mode === MISSION_BARRAGE_EVENT) return BARRAGE_LINE;');
    expect(code('src/ui/mission-line-keys.ts')).toContain('mode === MISSION_BARRAGE_EVENT ? (strait?.barrage ? strait.barrage.key : 0)');
    expect(code('src/systems/mission-telemetry.ts')).toContain('t.smokeBarrage = g ? g.barrageNear : 0;');
    expect(code('src/systems/telemetry-create.ts')).toContain('smokeBarrage: 0,');
    for (const f of SFX) expect(code(f), f).not.toMatch(/barrage-lines|smokeBarrage|smoke-barrage/);
  });
});
