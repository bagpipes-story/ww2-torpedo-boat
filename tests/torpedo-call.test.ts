// v0.8.2 IP2（実機 2 回目のユーザー「うち尽くしたあとの呼びかけは海の外に出るまでまたなくても8秒経過くらいで出せばいいんじゃないかな」）: 撃ち尽くしの呼びかけの時計
// systems/torpedo-call。残弾 0・待ち行列 0 で、走っている魚雷がみな決着したか、最後の発射から 8 秒（config の TORPEDO_CALL_AFTER_S。固定ステップの時計）の早い方。
// 任務の終わりの魚雷の待ち（最大 5 秒）は今のまま（mission-end は torpedoesRunning を読む＝このファイルを読まない）。mission-scene の撃ち尽くしの 1 行だけが読む。
import { describe, expect, it } from 'vitest';
import { TORPEDO_CALL_AFTER_S } from '../src/config/torpedo-call-config';
import { TorpedoCallClock, type TorpedoCallWorld } from '../src/systems/torpedo-call';
import { code } from './core-rules-kit';

function world(): TorpedoCallWorld & { torpedoes: { remaining: number; unresolvedCount: number }; launcher: { queued: number }; stepTimeS: number } {
  return { torpedoes: { remaining: 4, unresolvedCount: 0 }, launcher: { queued: 0 }, stepTimeS: 0 };
}

describe('撃ち尽くしの呼びかけ（systems/torpedo-call）', () => {
  it('8 秒（ユーザーの言葉）・config の定数（世界を変えない見せ方）', () => {
    expect(TORPEDO_CALL_AFTER_S).toBe(8);
  });
  it('残弾がある間・待ち行列がある間は出さない。残弾 0 で走る魚雷が無ければすぐ出す', () => {
    const c = new TorpedoCallClock(4);
    const w = world();
    expect(c.expended(w)).toBe(false);
    w.torpedoes.remaining = 0;
    w.launcher.queued = 1;
    expect(c.expended(w)).toBe(false);
    w.launcher.queued = 0;
    expect(c.expended(w)).toBe(true);
  });
  it('走っている魚雷があれば、最後の発射（残弾が減った時）から 8 秒で出す（7.99 秒は出さない）。先に決着すればその時', () => {
    const c = new TorpedoCallClock(4);
    const w = world();
    w.stepTimeS = 10;
    w.torpedoes.remaining = 1;
    w.torpedoes.unresolvedCount = 3;
    expect(c.expended(w)).toBe(false);
    w.stepTimeS = 12;
    w.torpedoes.remaining = 0;
    w.torpedoes.unresolvedCount = 4;
    expect(c.expended(w)).toBe(false); // 最後の発射は 12 秒
    w.stepTimeS = 12 + TORPEDO_CALL_AFTER_S - 0.01;
    expect(c.expended(w)).toBe(false);
    w.stepTimeS = 12 + TORPEDO_CALL_AFTER_S;
    expect(c.expended(w)).toBe(true);
    const d = new TorpedoCallClock(4);
    const v = world();
    v.torpedoes.remaining = 0;
    v.torpedoes.unresolvedCount = 1;
    v.stepTimeS = 5;
    expect(d.expended(v)).toBe(false);
    v.stepTimeS = 7;
    v.torpedoes.unresolvedCount = 0;
    expect(d.expended(v)).toBe(true);
  });
  it('配線: mission-scene の撃ち尽くしの 1 行だけが読む・mission-end（任務の終わりの待ち）は読まない・確保は作る時だけ', () => {
    expect(code('src/scenes/mission-scene.ts')).toContain("const expended = w.setup.mainWeapon === 'torpedo' ? w.torpedoCall.expended(w) : w.noTargetsLeft;");
    expect(code('src/systems/mission-end.ts')).not.toMatch(/torpedoCall|torpedo-call/);
    expect(code('src/systems/mission-world.ts')).toContain('this.torpedoCall = new TorpedoCallClock(this.torpedoes.capacity);');
    expect(code('src/systems/torpedo-call.ts').match(/new /g)).toBeNull();
  });
});
