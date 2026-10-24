// v0.6.2 実機 1 回目の HUD と夜の長さ: 左上 2 段目の夜明けの時計（ui/dawn-clock が使う ui/dawn-lines の clockJa・clockKey・clockColor）、
// 上中央の 2 行目が時計を避ける倍率（lineFitScale）、夜明けに岸へ逃げる大発の空襲の行の後ろ（bargeHideTagJa・bargeHideTagKey）、
// us_01 180 秒・us_03 160 秒（「夜明けまでの時間を 40 秒縮めて」）と、それに掛かる「帰投せよ」の呼びかけ。
// ui-config・game-config は DOM を読むので、HUD の位置は tests/dawn-lines と同じく数で書く（HUD_MARGIN 24・HUD_DEBUG_LINE_HEIGHT 26・HP_BAR_OFFSET_Y 58）。
import { describe, expect, it } from 'vitest';
import { playableMissionIds } from '../src/config/campaign-data';
import { gameData } from '../src/config/game-data';
import { HUD_CLOCK_GAP_PX, HUD_CLOCK_MAX_W_PX, HUD_COLOR_STRONG, HUD_COLOR_WARN, HUD_FONT_CLOCK_PX } from '../src/config/hud-text-config';
import { AS_T_FALLING, AS_T_INBOUND, AS_T_NONE, AS_T_ORBIT, AS_T_REST, AS_T_RUN } from '../src/core/air-strike';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createPtTelemetry } from '../src/core/pt-boats';
import { createConvoyTelemetry } from '../src/core/convoy';
import { createEngineTelemetry } from '../src/core/engine-trouble';
import { DAWN_AIR_ENEMY, DAWN_AIR_OWN, createDawnTelemetry, type DawnTelemetry } from '../src/core/dawn-air';
import { FF_IDLE, FF_OUT_NONE } from '../src/core/friendly';
import { GUN_SAFE } from '../src/core/gun-battery';
import { CALL_DAWN, CALL_FUEL, updateReturnCalls } from '../src/core/mission-flow';
import { SP_IDLE, SP_OUT_NONE } from '../src/core/seaplane';
import { GUN_FIRING } from '../src/core/gun-battery';
import { SHALLOW_APPROACHING, SHALLOW_INSIDE, SHALLOW_NONE } from '../src/core/shallows';
import { STORM_NONE } from '../src/core/storm';
import { buildWorldSetup } from '../src/systems/world-setup';
import { bargeHideTagJa, bargeHideTagKey, clockColor, clockJa, clockKey, lineFitScale, strikeLine } from '../src/ui/dawn-lines';
import { GUN_DISTANCE_STEP_M, gunLine } from '../src/ui/hud-lines';
import { MISSION_BARGE_RUN, MISSION_STRIKE, missionMode } from '../src/ui/mission-mode';

const S01 = buildWorldSetup(gameData, 'us_01');
const S03 = buildWorldSetup(gameData, 'us_03');
const PLAYABLE_IDS = [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')];

/** 2 行目の文と優先順が読む項目だけの中立のテレメトリ（tests/dawn-lines と同じ） */
function tele(dawn: Partial<DawnTelemetry> = {}, over: Partial<BoatTelemetry> = {}): BoatTelemetry {
  return {
    timeLeftS: 100,
    homeWaiting: false,
    fuelEmpty: false,
    escortEnabled: false,
    escortSunk: false,
    escortDistM: 0,
    escortLagWarnM: 400,
    planePhase: SP_IDLE,
    planeLocked: false,
    planeOutcome: SP_OUT_NONE,
    planeDx: NaN,
    planeDy: NaN,
    friendlyPhase: FF_IDLE,
    friendlyOutcome: FF_OUT_NONE,
    shallowState: SHALLOW_NONE,
    shallowAheadM: 0,
    shallowSafeKt: 15,
    gunMission: false,
    gunStatus: GUN_SAFE,
    bargesSunk: 0,
    bargesBeached: 0,
    bargesTotal: 0,
    bargeEscapeS: NaN,
    enemySighted: false,
    batteryInArc: false,
    batteryAlerted: false,
    stormState: STORM_NONE,
    stormFast: false,
    stormSafeKt: 12,
    pt: createPtTelemetry(), // 米PT の無い任務（v0.6.3。enabled false）
    convoy: createConvoyTelemetry(), // 輸送隊の無い任務（v0.6.4。enabled false）
    engine: createEngineTelemetry(), // 機関の不調の無い任務（v0.6.5。on false）
    ...over,
    dawn: { ...createDawnTelemetry(), ...dawn },
  } as BoatTelemetry;
}

/** HUD の文の幅の見積もり px（Menlo の半角 0.602 em・全角 1 em。tests/dawn-lines と同じ） */
function textWidthPx(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.charCodeAt(0) < 0x2000 ? 0.602 : 1) * px;
  return w;
}

const HUD_MARGIN = 24;
const ROW2_Y = HUD_MARGIN + 18 + 8; // HUD_MARGIN + HUD_DEBUG_LINE_HEIGHT（FPS の文字 18 px + 8）
const LINE2_PX = 22; // HUD_FONT_MISSION_PX
/** 2 行目が避ける左の幅（mission-line と同じ式） */
const RESERVE_PX = HUD_MARGIN + HUD_CLOCK_MAX_W_PX + HUD_CLOCK_GAP_PX;
/** 空襲の行の上限（tests/dawn-lines: 論理幅 1280 から左右の HUD_MARGIN と右上の丸ボタンの列） */
const STRIKE_LINE_MAX_PX = 1280 - 2 * (24 + 96);
/** us_03 の夜明けの後（敵の制空下・空襲あり。最初の波は西から） */
const US03: Partial<DawnTelemetry> = { reached: true, caughtOutside: true, air: DAWN_AIR_ENEMY, strikeEnabled: true, count: 4, fromJa: '西', ships: 'hide' };

describe('左上 2 段目の夜明けの時計（ui/dawn-clock。v0.6.2 実機 1 回目）', () => {
  it('出発時は「夜明けまで N 秒」（us_01 180・us_03 160）、夜明けの後は「夜明け後 N 秒」。キーは表示の秒が変わるときだけ変わる', () => {
    expect(clockJa(tele({}, { timeLeftS: S01.durationS }))).toBe('夜明けまで 180 秒');
    expect(clockJa(tele({}, { timeLeftS: S03.durationS }))).toBe('夜明けまで 160 秒');
    expect(clockJa(tele({ ...US03, daylightS: 12.7 }, { timeLeftS: 0 }))).toBe('夜明け後 12 秒');
    // 1 秒ずつ進めると 1 秒に 1 回だけキーが変わる（＝setText は 1 秒に 1 回）
    let changes = 0;
    let last = NaN;
    for (let ms = 0; ms <= 20000; ms += 16) {
      const left = 10 - ms / 1000;
      const t = left > 0 ? tele({}, { timeLeftS: left }) : tele({ ...US03, daylightS: -left }, { timeLeftS: 0 });
      const k = clockKey(t);
      if (k !== last) changes++;
      last = k;
    }
    expect(changes).toBe(10 + 11); // 夜明けまで 10〜1、夜明け後 0〜10
  });
  it('色: 夜明け前は強調色、夜明けの後は敵の空襲がある任務だけ警告色（味方の制空下・?debug&nostrike は強調色のまま）', () => {
    expect(clockColor(tele({ air: DAWN_AIR_ENEMY, strikeEnabled: true }))).toBe(HUD_COLOR_STRONG);
    expect(clockColor(tele({ ...US03 }))).toBe(HUD_COLOR_WARN);
    expect(clockColor(tele({ reached: true, caughtOutside: true, air: DAWN_AIR_OWN }))).toBe(HUD_COLOR_STRONG);
    expect(clockColor(tele({ ...US03, strikeEnabled: false }))).toBe(HUD_COLOR_STRONG);
    // 輪の中で夜明けを迎えても（caughtOutside false）任務の空は敵＝警告色（時計は空の状態を示す）
    expect(clockColor(tele({ ...US03, caughtOutside: false }))).toBe(HUD_COLOR_WARN);
  });
  it('大きさと位置: FPS（18 px）と同じか少し大きい。いちばん長い文は HUD_CLOCK_MAX_W_PX に収まり、FPS の行（［史実］）と HP の行（y 82）にかからない', () => {
    expect(HUD_FONT_CLOCK_PX).toBeGreaterThanOrEqual(18);
    expect(HUD_FONT_CLOCK_PX).toBeLessThanOrEqual(22);
    const longest = ['夜明けまで 999 秒', '夜明け後 9999 秒', ...PLAYABLE_IDS.map((id) => clockJa(tele({}, { timeLeftS: buildWorldSetup(gameData, id).durationS })))];
    for (const s of longest) expect(textWidthPx(s, HUD_FONT_CLOCK_PX), s).toBeLessThanOrEqual(HUD_CLOCK_MAX_W_PX);
    // 縦: FPS の行（y 24、18 px、行の高さは文字の約 1.2 倍）の下端 < 時計の上端 < 時計の下端 < HP の行（HUD_MARGIN + HP_BAR_OFFSET_Y 58）
    expect(HUD_MARGIN + 18 * 1.2).toBeLessThan(ROW2_Y);
    expect(ROW2_Y + HUD_FONT_CLOCK_PX * 1.2).toBeLessThan(HUD_MARGIN + 58);
    // ?debug の描画サイズの行（ui/debug-hud の SIZE_TEXT_Y = 燃料計の下端 166 + 8 = 174、18 px）は一時停止ボタンの上端 234 より上
    const sizeY = HUD_MARGIN + 102 + 18 + 8 + 10 / 2 + 18 / 2 + 8;
    expect(sizeY).toBe(174);
    expect(sizeY + 18 * 1.2).toBeLessThan(270 - 48 * 0.75);
  });
});

describe('上中央の 2 行目が時計を避ける（lineFitScale）', () => {
  it('収まれば 1、はみ出せば gameW − 2×reserve に縮める', () => {
    expect(lineFitScale(800, 1280, RESERVE_PX)).toBe(1);
    expect(lineFitScale(1280 - 2 * RESERVE_PX, 1280, RESERVE_PX)).toBe(1);
    const k = lineFitScale(1000, 1280, RESERVE_PX);
    expect(k).toBeLessThan(1);
    expect(1000 * k).toBeCloseTo(1280 - 2 * RESERVE_PX, 9);
    expect(lineFitScale(0, 1280, RESERVE_PX)).toBe(1);
  });
  it('いちばん長い空襲の行（僚艇の被弾・浅瀬、us_03 の大発 岸へ・浅瀬）: 論理幅 1280 では縮めて左端が時計の右（隙間込み）より右、iPhone の幅 1,560 では縮めない', () => {
    const vip: Partial<BoatTelemetry> = { escortEnabled: true, escortHp: 90, escortHpMax: 90, shallowState: SHALLOW_APPROACHING, shallowAheadM: 940 };
    // us_03 は沿岸砲の射界の中（レビュー: 夜明けの 2 群目は沿岸砲の射界の近く）も。大発の後ろ書きがある間は沿岸砲を出さない、無ければ出す
    const hunts: Partial<BoatTelemetry>[] = [false, true].flatMap((battery) => [false, true].map((alerted) => ({ gunMission: true, shallowState: SHALLOW_APPROACHING, shallowAheadM: 940, batteryInArc: battery, batteryAlerted: alerted })));
    const lines = [
      ...[AS_T_RUN, AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST].map((th) => strikeLine(tele({ ...US03, fromJa: '北西', threat: th, plane: 3, bombsLeft: 15, restS: 99, inboundDistM: 3000, fallingArc: true }, vip), 19, false, true).text),
      ...hunts.flatMap((hunt) =>
        [0, 4].flatMap((running) => [AS_T_RUN, AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST].map((th) => strikeLine(tele({ ...US03, threat: th, plane: 3, bombsLeft: 15, restS: 99, inboundDistM: 3000, fallingArc: true, bargesRunning: running }, hunt), 19, false, false).text)),
      ),
    ];
    expect(lines.some((x) => x.includes('沿岸砲の射界'))).toBe(true); // 大発の後ろ書きが無い行には沿岸砲が付く
    let widest = 0;
    for (const text of lines) {
      const w = textWidthPx(text, LINE2_PX);
      widest = Math.max(widest, w);
      const k = lineFitScale(w, 1280, RESERVE_PX);
      expect(1280 / 2 - (w * k) / 2, text).toBeGreaterThanOrEqual(RESERVE_PX - 1e-9);
      expect(LINE2_PX * k, text).toBeGreaterThanOrEqual(17); // 縮めても 17 px 以上（FPS 18 px とほぼ同じ）
      expect(lineFitScale(w, 1560, RESERVE_PX), text).toBe(1);
    }
    // 縮める前は 1280 で時計にかかっていた（だから縮める）
    expect(1280 / 2 - widest / 2).toBeLessThan(RESERVE_PX);
  });
});

describe('夜明けに岸へ逃げる大発の空襲の行（bargeHideTagJa。us_03）', () => {
  it('逃げている間「大発 岸へ N 隻」、全隻が着いた直後だけ「大発 上陸 N 隻」、ほかは付けない。キーは文が変わるときだけ変わる', () => {
    expect(bargeHideTagJa(createDawnTelemetry(), false)).toBe('');
    expect(bargeHideTagJa({ ...createDawnTelemetry(), bargesRunning: 3, bargesHidden: 1 }, false)).toBe(' ・ 大発 岸へ 3 隻');
    expect(bargeHideTagJa({ ...createDawnTelemetry(), bargesRunning: 3, bargesHidden: 1 }, true)).toBe(' ・ 大発 岸へ 3 隻'); // 逃げている間は上陸の表示より先
    expect(bargeHideTagJa({ ...createDawnTelemetry(), bargesRunning: 0, bargesHidden: 4 }, true)).toBe(' ・ 大発 上陸 4 隻');
    expect(bargeHideTagJa({ ...createDawnTelemetry(), bargesRunning: 0, bargesHidden: 4 }, false)).toBe('');
    expect(bargeHideTagJa({ ...createDawnTelemetry(), bargesRunning: 0, bargesHidden: 0 }, true)).toBe(''); // 夜明け前の上陸（隠れた数 0）は付けない
    const key = (r: number, h: number, l: boolean): number => bargeHideTagKey({ ...createDawnTelemetry(), bargesRunning: r, bargesHidden: h }, l);
    expect(new Set([key(0, 0, false), key(4, 0, false), key(3, 1, false), key(0, 4, true), key(0, 3, true)]).size).toBe(5);
    expect(key(3, 1, false)).toBe(key(3, 1, true));
    expect(key(0, 4, false)).toBe(0);
    expect(key(0, 0, true)).toBe(0);
  });
  it('空襲の行の後ろ（僚艇の HP の後・浅瀬の警告の前）。夜明けの後に岸へ逃げる間は空襲の行が出る（大発の逃走の行より上）', () => {
    const t = tele({ ...US03, threat: AS_T_INBOUND, inboundDistM: 2950, bargesRunning: 4 }, { gunMission: true, bargeEscapeS: 6, shallowState: SHALLOW_APPROACHING, shallowAheadM: 140 });
    expect(strikeLine(t, 3, false, false).text).toBe('空襲！ 敵機 4 機 ・ 西から 3000 m ・ 帰投を急げ ・ 大発 岸へ 4 隻 ・ 浅瀬 150 m 減速');
    expect(missionMode(t, CALL_DAWN, 0)).toBe(MISSION_STRIKE);
    const landed = tele({ ...US03, threat: AS_T_ORBIT, plane: 1, bombsLeft: 6, bargesHidden: 4 }, { gunMission: true });
    expect(strikeLine(landed, 0, false, false, true).text).toBe('敵機 旋回 ・ 次は 2 番機 ・ 残り爆弾 6 ・ 大発 上陸 4 隻');
    expect(strikeLine(landed, 0, false, false, false).text).toBe('敵機 旋回 ・ 次は 2 番機 ・ 残り爆弾 6');
    // 空襲がまだ来ていない（NONE）・波の合間（REST）は大発の逃走の行（「大発が岸へ逃げる ・ 上陸まで N 秒」）が出る（v0.6.1 の優先順のまま）
    expect(missionMode(tele({ ...US03, threat: AS_T_NONE, bargesRunning: 4 }, { gunMission: true, bargeEscapeS: 6 }), CALL_DAWN, 0)).toBe(MISSION_BARGE_RUN);
    expect(missionMode(tele({ ...US03, threat: AS_T_REST, restS: 10, bargesRunning: 4 }, { gunMission: true, bargeEscapeS: 6 }), CALL_DAWN, 0)).toBe(MISSION_BARGE_RUN);
  });
  it('文の幅: us_03 の空襲の行＋大発＋沿岸砲＋浅瀬の警告は右上の丸ボタンの列にかからない（論理幅 1280。tests/dawn-lines の上限と同じ）', () => {
    for (const shallowState of [SHALLOW_APPROACHING, SHALLOW_INSIDE]) {
      for (const [battery, alerted] of [[false, false], [true, false], [true, true]] as const) {
        const hunt: Partial<BoatTelemetry> = { gunMission: true, shallowState, shallowAheadM: 940, batteryInArc: battery, batteryAlerted: alerted };
        for (const fromJa of ['西', '北', '東', '南']) {
          for (const th of [AS_T_RUN, AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST]) {
            for (const [r, h, l] of [[4, 0, false], [0, 4, true], [0, 4, false]] as const) {
              const text = strikeLine(tele({ ...US03, fromJa, threat: th, plane: 3, bombsLeft: 15, restS: 99, inboundDistM: S03.airStrike!.spawnM, fallingArc: true, bargesRunning: r, bargesHidden: h }, hunt), 19, false, false, l).text;
              expect(textWidthPx(text, LINE2_PX), text).toBeLessThanOrEqual(STRIKE_LINE_MAX_PX);
            }
          }
        }
      }
    }
  });
  it('沿岸砲の射界の中: 大発の後ろ書き（岸へ・上陸）がある間は沿岸砲の警告を出さず、後ろ書きが消えたら出す（キーは bargeKey の射界ビットと bargeTagKey が別に持つ）', () => {
    const hunt: Partial<BoatTelemetry> = { gunMission: true, batteryInArc: true, batteryAlerted: true, shallowState: SHALLOW_INSIDE, shallowSafeKt: 15 };
    const inbound = { ...US03, threat: AS_T_INBOUND, inboundDistM: 2950 };
    expect(strikeLine(tele({ ...inbound, bargesRunning: 4 }, hunt), 0, false, false).text).toBe('空襲！ 敵機 4 機 ・ 西から 3000 m ・ 帰投を急げ ・ 大発 岸へ 4 隻 ・ 浅瀬 15 kt 以下');
    expect(strikeLine(tele({ ...inbound, bargesHidden: 4 }, hunt), 0, false, false, true).text).toBe('空襲！ 敵機 4 機 ・ 西から 3000 m ・ 帰投を急げ ・ 大発 上陸 4 隻 ・ 浅瀬 15 kt 以下');
    expect(strikeLine(tele({ ...inbound, bargesHidden: 4 }, hunt), 0, false, false, false).text).toBe('空襲！ 敵機 4 機 ・ 西から 3000 m ・ 帰投を急げ ・ 沿岸砲！ ・ 浅瀬 15 kt 以下');
    expect(strikeLine(tele({ ...inbound }, { ...hunt, batteryAlerted: false }), 0, false, false).text).toBe('空襲！ 敵機 4 機 ・ 西から 3000 m ・ 帰投を急げ ・ 沿岸砲の射界 ・ 浅瀬 15 kt 以下');
  });
  it('us_03 の砲の行（射撃中・遠い・上陸まで・沿岸砲の射界・浅瀬。夜明けの前から）: 論理幅 1280 でも時計を避けて約 16 px 以上、1,560 では約 0.97 倍以上（空襲の行と違い少し縮む）', () => {
    const g = S03.guns!;
    let widest = 0;
    for (const shallowState of [SHALLOW_APPROACHING, SHALLOW_INSIDE]) {
      for (const alerted of [false, true]) {
        const t = tele({}, { gunMission: true, gunStatus: GUN_FIRING, gunFast: false, gunEffectiveM: g.effectiveM, gunRangeM: g.rangeM, bargesSunk: 2, bargesQuota: 3, batteryInArc: true, batteryAlerted: alerted, shallowState, shallowSafeKt: 15 });
        const text = gunLine(t, Math.ceil(g.rangeM / GUN_DISTANCE_STEP_M), 99, 19).text;
        const w = textWidthPx(text, LINE2_PX);
        widest = Math.max(widest, w);
        const k = lineFitScale(w, 1280, RESERVE_PX);
        expect(1280 / 2 - (w * k) / 2, text).toBeGreaterThanOrEqual(RESERVE_PX - 1e-9);
        expect(LINE2_PX * k, text).toBeGreaterThanOrEqual(16);
        expect(lineFitScale(w, 1560, RESERVE_PX), text).toBeGreaterThanOrEqual(0.97);
      }
    }
    expect(lineFitScale(widest, 1560, RESERVE_PX)).toBeLessThan(1); // 砲の行は 1,560 でもわずかに縮む（docs/02 §6.7・CHANGELOG の記述どおり）
  });
});

describe('夜の長さ（v0.6.2 実機 1 回目「大発を狩れとコレヒドール脱出の夜明けまでの時間を 40 秒縮めて」）', () => {
  it('us_01 220 → 180 秒・us_03 200 → 160 秒（us_02 150・jp_06 160 は変えない）。source に理由と以前の値', () => {
    expect([S01.durationS, S03.durationS, buildWorldSetup(gameData, 'us_02').durationS, buildWorldSetup(gameData, 'jp_06').durationS]).toEqual([180, 160, 150, 160]);
    const protoOf = (id: string): Record<string, unknown> => (gameData.missionsSeed.missions as unknown as Record<string, unknown>[]).find((m) => m['id'] === id)!['v0_1_prototype'] as Record<string, unknown>;
    for (const [id, was] of [['us_01', 220], ['us_03', 200]] as const) {
      const src = String(protoOf(id)['duration_s_source']);
      expect(src, id).toContain('v0.6.2 実機 1 回目');
      expect(src, id).toContain('夜明けまでの時間を 40 秒縮めて');
      expect(src, id).toContain(`以前の ${was} 秒の根拠`);
    }
  });
  it('出発時に「夜明け近し」も「燃料少」も立たない（遊べる任務すべて。巡航で輪の縁まで帰る秒 × call_margin < 夜の長さ）', () => {
    for (const id of PLAYABLE_IDS) {
      const s = buildWorldSetup(gameData, id);
      const rp = s.mission.returnPoint;
      const edge = Math.max(0, Math.hypot(s.playerStart.x - rp.x, s.playerStart.y - rp.y) - rp.radiusM);
      const needS = edge / (s.fuelCurve.cruiseMps * s.timeScale);
      const needGal = edge * s.fuelCurve.galPerMCruise;
      const flags = updateReturnCalls(0, false, false, s.fuelAllotmentGal, needGal, s.durationS, needS, rp.callMargin);
      expect(flags & (CALL_DAWN | CALL_FUEL), id).toBe(0);
      // 夜明けの約 1 分前より早くは立たない（出発点から帰るだけなら）
      expect(needS * rp.callMargin, id).toBeLessThan(s.durationS - 50);
    }
  });
});
