// 卯月の模擬のつまみ（v0.6.10 S3b。jp_04。spec-v0610 §6.4・リードの決定 LD14・LD16）: scripts/landing-sim の ALLY_* と DAWN の上書きを data の写しに当て、世界と同じ組み立て
// （world-setup → config/ally-destroyer-mission-data の V-A1〜V-A6。今夜の南北のずれ込み）を通す。つまみの範囲の外の値は例外で止める（G-B4: 範囲を黙って広げない）。data は変えない。
// 範囲（§6.4。位置は LD16 で泊地の北東へ移ったので、S1 の位置の探索で全部の検査を通る 18 か所から、採った (3620, 2380) と釣り合いの余裕の大きい近くの 2 か所）:
// 位置 (3620, 2380)・(3610, 2400)・(3590, 2420)・扇の始め 50〜60°・速い PT の見張り 700〜900 m・0.3〜1.0/秒・遅い PT 300 m〜V-A3 の上限（検査が止める）・0.2〜0.4/秒・
// 照らされて反応 0.5〜1.5 秒・去る PT を追う 0〜3 秒・25 mm の有無（切ると pt_sink_chance の無い砲を記録の写しから外す）。夜明けは確かめの 160〜200 秒（duration_s。V6 も通す）。
// 卯月を切る上書き（allyOff）と卯月のつまみは一緒に使えない（夜明けは使える＝卯月の無い夜と同じ夜明けで比べる）。Phaser 非依存・window を読まない。
import type { GameData } from '../config/game-data';

/** 卯月のつまみと夜明け（無ければ data の値） */
export interface AllySimOverrides {
  /** station の x_m, y_m（艇首はそのまま） */
  allyStation?: readonly [number, number];
  /** watch_arc_deg の始め（終わりはそのまま） */
  allyArc0?: number;
  allyLookSlowM?: number; allyRateSlow?: number;
  allyLookFastM?: number; allyRateFast?: number;
  /** light_react_s・chase_fire_s */
  allyReactS?: number; allyChaseS?: number;
  /** 25 mm を切る（艦の記録の写しから pt_sink_chance の無い砲を外す） */
  ally25Off?: boolean;
  /** 任務の duration_s（夜明けの確かめ。卯月を切っても使える） */
  dawnS?: number;
}

/** 卯月のつまみの鍵（夜明けを除く） */
export const ALLY_KNOB_KEYS = ['allyStation', 'allyArc0', 'allyLookSlowM', 'allyRateSlow', 'allyLookFastM', 'allyRateFast', 'allyReactS', 'allyChaseS', 'ally25Off'] as const;
type RangeKey = 'allyArc0' | 'allyLookSlowM' | 'allyRateSlow' | 'allyLookFastM' | 'allyRateFast' | 'allyReactS' | 'allyChaseS' | 'dawnS';
/** 位置のつまみ（S1 の位置の探索で V-A1〜V-A5 を通る 18 か所のうち 3 か所。tests/ally-sim-knobs がノーマル・ハードで通ると確かめる） */
export const ALLY_KNOB_STATIONS: readonly (readonly [number, number])[] = [[3620, 2380], [3610, 2400], [3590, 2420]];
/** 数のつまみの範囲（端を含む。遅い PT の見張りの上は V-A3 の上限＝組み立ての検査が止める） */
export const ALLY_KNOB_RANGES: Readonly<Record<RangeKey, readonly [number, number]>> = {
  allyArc0: [50, 60], allyLookSlowM: [300, Infinity], allyRateSlow: [0.2, 0.4], allyLookFastM: [700, 900], allyRateFast: [0.3, 1],
  allyReactS: [0.5, 1.5], allyChaseS: [0, 3], dawnS: [160, 200],
};

/** 卯月のつまみ（夜明けを除く）が 1 つでもある */
export function hasAllyKnobs(o: AllySimOverrides): boolean {
  return ALLY_KNOB_KEYS.some((k) => o[k] !== undefined);
}

/** 卯月のつまみを除いた写し（I9 の卯月の無い夜。夜明けとほかの上書きは残す） */
export function withoutAllyKnobs<T extends AllySimOverrides>(o: T): T {
  const c = { ...o };
  for (const k of ALLY_KNOB_KEYS) delete c[k];
  return c;
}

/** つまみの検査: 範囲の外・位置の候補の外・卯月を切ったのに卯月のつまみ、は例外（「卯月のつまみ allyRateFast は 0.3〜1（1.2）」） */
export function checkAllyKnobs(o: AllySimOverrides, allyOff: boolean): void {
  const bad = (msg: string): never => {
    throw new Error(`卯月のつまみ ${msg}（spec-v0610 §6.4）`);
  };
  if (allyOff && hasAllyKnobs(o)) bad(`${ALLY_KNOB_KEYS.filter((k) => o[k] !== undefined).join('・')} は卯月を切った夜（allyOff・ALLY_OFF=1）に使えない`);
  for (const [k, [lo, hi]] of Object.entries(ALLY_KNOB_RANGES) as [RangeKey, readonly [number, number]][]) {
    const v = o[k];
    if (v !== undefined && !(v >= lo && v <= hi)) bad(`${k} は ${lo}〜${hi === Infinity ? 'V-A3 の上限' : hi}（${v}）`);
  }
  const st = o.allyStation;
  if (st && !ALLY_KNOB_STATIONS.some(([x, y]) => x === st[0] && y === st[1])) bad(`allyStation は ${ALLY_KNOB_STATIONS.map(([x, y]) => `(${x}, ${y})`).join('・')} のどれか（(${st.join(', ')})）`);
}

type Rec = Record<string, unknown>;

/** 卯月のつまみと夜明けを当てた data の写し（無ければそのまま）。卯月のつまみは v0_1_prototype.ally_destroyer のある任務だけ */
export function withAllyOverrides(data: GameData, missionId: string, o: AllySimOverrides): GameData {
  const knobs = hasAllyKnobs(o);
  if (!knobs && o.dawnS === undefined) return data;
  let shipId = '';
  const missions = (data.missionsSeed.missions as readonly Rec[]).map((m) => {
    if (m['id'] !== missionId) return m;
    const proto = m['v0_1_prototype'] as Rec;
    const next: Rec = { ...proto, duration_s: o.dawnS ?? proto['duration_s'] };
    if (knobs) {
      const b = proto['ally_destroyer'] as Rec | undefined;
      if (!b) throw new Error(`卯月のつまみ: ${missionId} に v0_1_prototype.ally_destroyer が無い`);
      shipId = String(b['ship_id']);
      const st = b['station'] as Rec;
      const arc = b['watch_arc_deg'] as readonly number[];
      next['ally_destroyer'] = {
        ...b,
        station: { ...st, x_m: o.allyStation?.[0] ?? st['x_m'], y_m: o.allyStation?.[1] ?? st['y_m'] },
        watch_arc_deg: [o.allyArc0 ?? arc[0], arc[1]],
        lookout_slow_m: o.allyLookSlowM ?? b['lookout_slow_m'], spot_rate_slow_per_s: o.allyRateSlow ?? b['spot_rate_slow_per_s'],
        lookout_fast_m: o.allyLookFastM ?? b['lookout_fast_m'], spot_rate_fast_per_s: o.allyRateFast ?? b['spot_rate_fast_per_s'],
        light_react_s: o.allyReactS ?? b['light_react_s'], chase_fire_s: o.allyChaseS ?? b['chase_fire_s'],
      };
    }
    return { ...m, v0_1_prototype: next };
  });
  const enemies = (data.enemies.enemies as readonly Rec[]).map((e) => {
    if (o.ally25Off !== true || e['id'] !== shipId) return e;
    return { ...e, guns: (e['guns'] as readonly Rec[]).filter((g) => typeof g['pt_sink_chance'] === 'number') };
  });
  return { ...data, missionsSeed: { ...data.missionsSeed, missions }, enemies: { ...data.enemies, enemies } } as unknown as GameData;
}
