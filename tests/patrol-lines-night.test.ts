// v0.6.7 レビューの直し（ai・ux:ux-1・ux-3・ux-4）: 本物の門番・夜の出撃・夜明けの空襲（tests/patrol-world-kit）で回した jp_02 の夜の 2 行目と 3 行目の並び。
// 航跡の行「航跡が出ている ・ あと N 秒」は航跡の帯の間だけで N は増えない（14 kt 以下へ落とすと消える）、出撃の機が去る間の 3 行目は「全速で走り」と言わない、
// 出撃の後に全速なら結果の行の残りより航跡の行が出る、夜明けの後の 3 行目は空襲の行（艦影の「未発見」に戻らない）。ui/boat-hud の配線はソースで見る。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PA_HUNT, PA_SORTIE } from '../src/core/patrol-air-state';
import { missionMode } from '../src/ui/mission-mode';
import { PATROL_STATUS_DAWN, PATROL_STATUS_SORTIE, patrolLine, patrolModeOf, patrolStatusLine, patrolStatusOf } from '../src/ui/patrol-lines';
import { DT, drive, driveUntil, makeKit, type Kit } from './patrol-world-kit';

const line2 = (k: Kit): string => {
  const mode = missionMode(k.t, 0, 0);
  return patrolModeOf(mode) ? patrolLine(k.t, mode).text : `mode ${mode}`;
};
const status = (k: Kit): number => patrolStatusOf(k.t.patrol, k.t.targetStep, k.t.dawn.reached && k.t.dawn.strikeEnabled);
const WAKE_RE = /^航跡が出ている ・ あと (\d+) 秒/;

describe('航跡の行（レビュー ux:ux-1）', () => {
  it('全速 2.2 秒で数え始めてから静音へ落とすと、航跡の行はすぐ消え（N が 1 → 2 → 3 と増えない）、「次の捜索まで」に戻る', () => {
    const k = makeKit(11);
    // 最初の出撃が終わって哨戒に戻るまで（HUD どおり）、止まって数えを 0 に
    expect(driveUntil(k, (x) => x.flight.state.waves === 1 && x.t.patrol.phase === PA_HUNT, 'hud', 80)).toBe(true);
    expect(driveUntil(k, (x) => x.t.targetStep === 'stop' && Number.isNaN(x.t.patrol.wakeLeftS), 'stop', 20)).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 2.2 / DT; i++) {
      drive(k, 'run');
      k.step();
      seen.push(line2(k));
    }
    expect(seen.some((s) => WAKE_RE.test(s))).toBe(true);
    let prevN = Infinity;
    let wakeShownWhileQuiet = 0;
    let draining = 0;
    for (let i = 0; i < 4 / DT && k.t.patrol.phase === PA_HUNT; i++) {
      drive(k, 'quiet');
      k.step();
      const s = line2(k);
      const m = WAKE_RE.exec(s);
      if (m) {
        expect(Number(m[1])).toBeLessThanOrEqual(prevN);
        prevN = Number(m[1]);
        if (k.t.targetStep !== 'cruise' && k.t.targetStep !== 'full') wakeShownWhileQuiet++;
      }
      // 静音で数えが残っている（減っている）間は「次の捜索まで」（前は「航跡が出ている ・ あと 1 → 2 → 3 秒」）
      if (k.t.targetStep === 'silent' && k.t.patrol.wakeLeftS > 0) {
        draining++;
        expect(s).toMatch(/^敵機は捜索中 ・ 次の捜索まで \d+ 秒/);
      }
    }
    expect(wakeShownWhileQuiet).toBe(0);
    expect(draining).toBeGreaterThan(60);
    expect(k.t.patrol.phase).toBe(PA_HUNT); // 静音へ落としたので航跡では来ない
  });
});

describe('出撃の終わり（レビュー ux:ux-4）', () => {
  it('止まらずに走る夜（run）: 機が去る間（REST）の 3 行目は「全速で走り」ではなく帯の状態、哨戒に戻ると結果の行より航跡の行が先に出て、航跡の捜索の 2.9 秒以上前から見える', () => {
    const k = makeKit(11);
    let restFrames = 0;
    let sortieStatusInRest = 0;
    expect(driveUntil(k, (x) => {
      if (x.t.patrol.phase === PA_SORTIE && /^敵機 去る/.test(line2(x))) {
        restFrames++;
        if (status(x) === PATROL_STATUS_SORTIE) sortieStatusInRest++;
        expect(patrolStatusLine(x.t.patrol, status(x)).text).not.toContain('全速で走り');
      }
      return x.flight.state.waves === 1 && x.t.patrol.phase === PA_HUNT;
    }, 'run', 80)).toBe(true);
    expect(restFrames).toBeGreaterThan(60);
    expect(sortieStatusInRest).toBe(0);
    const t0 = k.w.stepTimeS;
    let firstWake = NaN;
    expect(driveUntil(k, (x) => {
      if (Number.isNaN(firstWake) && WAKE_RE.test(line2(x))) firstWake = x.w.stepTimeS;
      return x.t.patrol.phase !== PA_HUNT;
    }, 'run', 20)).toBe(true);
    expect(firstWake - t0).toBeLessThan(0.1);
    expect(k.w.stepTimeS - firstWake).toBeGreaterThan(2.9);
    expect(line2(k)).toMatch(/^航跡を見られた！/);
  });
});

describe('夜明けの後の 3 行目（レビュー ai・ux:ux-3）', () => {
  it('夜明け 30 秒の夜（run）: ラッチから終わりまで 3 行目は「夜明けの空襲（止まっても見える）」で、艦影の行（-1）に戻らない', () => {
    const k = makeKit(11, 30);
    expect(driveUntil(k, (x) => x.t.dawn.reached, 'run', 40)).toBe(true);
    expect(k.t.dawn.strikeEnabled).toBe(true);
    let frames = 0;
    driveUntil(k, (x) => {
      frames++;
      expect(status(x)).toBe(PATROL_STATUS_DAWN);
      return x.w.atHome || x.w.stepTimeS > 70;
    }, 'run', 60);
    expect(frames).toBeGreaterThan(600);
    expect(patrolStatusLine(k.t.patrol, PATROL_STATUS_DAWN)).toEqual({ text: '空から ・ 夜明けの空襲（止まっても見える）', warn: true });
  });
  it('ui/boat-hud は夜明けに達していて空襲がある任務だけ空襲の状態を渡す（?debug&nostrike は今の行）', () => {
    const src = readFileSync(new URL('../src/ui/boat-hud.ts', import.meta.url), 'utf8');
    expect(src).toContain('const pst = patrolStatusOf(t.patrol, t.targetStep, t.dawn.reached && t.dawn.strikeEnabled);');
  });
});
