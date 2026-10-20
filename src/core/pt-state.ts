// 敵の米PT の隊（v0.6.3。docs/02 §6.4）の定数・型・状態の確保と読み出し（core/pt-boats から分けた。300 行を超えないため。air-strike-state と同じ形）。Phaser 非依存。
// 確保は createPtSection・createPtTelemetry だけ（出撃の組み立てのとき）。段階の進め方は pt-boats.ts。使う側は core/pt-boats だけを import する（ここを出し直している）。
import type { BoatState } from './boat-motion';
import type { PtParams } from './pt-data';
import { createShells, type ShellState } from './shells';
import type { SmokeParams, SmokeState } from './smoke';

/** 米PT の乱数の系列（seed+18。射撃の散布と命中の火災・機関だけ。+17 は見張り、+16 は今夜の揺らぎ、+19 は夜明けの空襲） */
export const PT_SEED_OFFSET = 18;

/** 段階: 哨戒 → 警戒 → 突撃 → 航過 → 離脱（→ 突撃）→ 去る → 海域の外 */
export const PT_PATROL = 0;
export const PT_ALERT = 1;
export const PT_RUN_IN = 2;
export const PT_PASS = 3;
export const PT_BREAK = 4;
export const PT_LEAVE = 5;
export const PT_OUT = 6;

export interface PtBoatState extends BoatState {
  phase: number;
  /** 哨戒で向かう線の端（0 = 始点・1 = 終点） */
  wp: number;
  /** 段階の体感秒（警戒は残り、突撃・航過・離脱は経過） */
  timerS: number;
  /** 突撃で艇を置く側（+1 = PT の右に見て航過、−1 = 左） */
  side: number;
  /** 航過と離脱の固めた針路、航過の速さ（game m/s） */
  lockDeg: number;
  passMps: number;
  passes: number;
  /** 射撃の間隔の残り（負の残りを繰り越す）・この航過の残り弾と発射 */
  cooldownS: number;
  roundsLeft: number;
  firedThisPass: number;
}

export interface PtSection {
  boats: PtBoatState[];
  shells: ShellState[];
  /** このステップに艇を見た PT（1）。隊として捉えている（見失って detectHoldS 経つまで） */
  seen: Uint8Array;
  detected: boolean;
  holdLeftS: number;
  /** 最後に見た艇の位置・速度（game m/s）とそれからの体感秒（見えていない間はここから推す） */
  lkX: number; lkY: number; lkVx: number; lkVy: number; lkAgeS: number;
  /** 航過中の PT（−1 は無し）、次の航過を固められるまでの体感秒、固めたときのかわす向き（−1 左・0 そのまま・+1 右） */
  owner: number; gapLeftS: number; dodge: number;
  /** 今の航過の命中・終わった航過の通し番号（HUD の「かわした！」）・最後の航過の命中と撃ったか・その PT（後から落ちた弾もその航過に数える）・固めた時刻 */
  passHits: number; passSeq: number; lastPassHits: number; lastPassFired: boolean; lastPassBoat: number; commitAtS: number;
  /** 突撃の狙いの点（使い回し） */
  aim: { x: number; y: number };
  /** KPI: 航過（撃った・無傷）・発射・命中、最初に見つけた距離 m（NaN は無し）、見失わせた回数、予告から初弾までの最短秒、最接近の二乗、去った数、夜明けに去った */
  passes: number; firedPasses: number; cleanPasses: number; shots: number; hits: number;
  firstDetectM: number; lostContacts: number; minWarnS: number; closest2: number; out: number; leftAtDawn: boolean;
}

/** 世界が固定ステップごとに中身だけ書き換える材料（1 個だけ作る。barges の FlotillaCheck と同じ） */
export interface PtCheck {
  boat: BoatState;
  boatHalfLengthM: number;
  boatHalfBeamM: number;
  /** 煙幕に遮られないときの発見距離（月明・速力帯込み）。遮られた PT は × smokeFactor */
  detectOpenM: number;
  smokeFactor: number;
  smoke: SmokeState | null;
  smokeParams: SmokeParams | null;
  /** 艇が浮いていて帰投の輪の外（見つける・撃つ・当たる相手がいる） */
  targetValid: boolean;
  /** 艇の視程の二乗（見えない PT からは撃たない） */
  visRange2: number;
  /** 夜明けのラッチの後、出撃からの体感秒 */
  dawn: boolean;
  timeS: number;
}

/** 呼ぶ側への知らせ（引数は数と真偽だけ） */
export interface PtEvents {
  onContact(gained: boolean): void;
  onCommit(i: number, lockDeg: number, dodge: number): void;
  onFire(i: number, x: number, y: number): void;
  onImpact(x: number, y: number, hit: boolean): void;
  onPassEnd(i: number, fired: boolean, hits: number): void;
  onLeave(i: number): void;
  onOut(i: number): void;
}

/** HUD に渡す米PT の状態（systems/pt-telemetry が毎フレーム中身だけ書く。米PT の無い任務は enabled false のまま） */
export interface PtTelemetry {
  enabled: boolean;
  /** 隻数・去っていない（< 去る）・海域の外へ出た */
  total: number; alive: number; out: number;
  /** 隊が捉えている・航過中・その航過で撃った・かわす向き・脅威の PT の段階（−1 は無し） */
  detected: boolean; passing: boolean; fired: boolean; dodge: number; threatPhase: number;
  /** 艇から脅威の PT へ（m。無ければ NaN）、それが見えている（視程の内） */
  dx: number; dy: number; sighted: boolean;
  /** 隊の航過の数と上限（count × max_passes）、終わった航過の通し番号、最後の航過の命中と撃ったか（撃たなかった航過は「かわした！」を出さない）、1 発の HP、夜明けに去った */
  passes: number; maxPasses: number; passSeq: number; lastPassHits: number; lastPassFired: boolean; damagePerHit: number; leftAtDawn: boolean;
  /** 出撃のときに 1 回: 艇の静音の上限 kt・去る方角（東など） */
  silentMaxKt: number; leaveDirJa: string;
}

export function createPtTelemetry(): PtTelemetry {
  return {
    enabled: false, total: 0, alive: 0, out: 0, detected: false, passing: false, fired: false, dodge: 0, threatPhase: -1, dx: NaN, dy: NaN, sighted: false,
    passes: 0, maxPasses: 0, passSeq: 0, lastPassHits: 0, lastPassFired: false, damagePerHit: 0, leftAtDawn: false, silentMaxKt: NaN, leaveDirJa: '',
  };
}

/** 出発点に哨戒で並べる（今夜の揺らぎは p に入っている）。shellPoolSize は弾の数（config/pt-config の PT_SHELL_POOL_SIZE） */
export function createPtSection(p: PtParams, shellPoolSize: number): PtSection {
  const boats: PtBoatState[] = [];
  for (let i = 0; i < p.count; i++) {
    boats.push({ x: p.startX[i]!, y: p.startY[i]!, headingDeg: p.startHeadingDeg[i]!, speedMps: p.patrolMps, phase: PT_PATROL, wp: 1, timerS: 0, side: 1, lockDeg: 0, passMps: 0, passes: 0, cooldownS: 0, roundsLeft: 0, firedThisPass: 0 });
  }
  return {
    boats, shells: createShells(shellPoolSize), seen: new Uint8Array(p.count), detected: false, holdLeftS: 0,
    lkX: 0, lkY: 0, lkVx: 0, lkVy: 0, lkAgeS: 0, owner: -1, gapLeftS: 0, dodge: 0,
    passHits: 0, passSeq: 0, lastPassHits: 0, lastPassFired: false, lastPassBoat: -1, commitAtS: NaN, aim: { x: 0, y: 0 },
    passes: 0, firedPasses: 0, cleanPasses: 0, shots: 0, hits: 0, firstDetectM: NaN, lostContacts: 0, minWarnS: Infinity, closest2: Infinity, out: 0, leftAtDawn: false,
  };
}

/** 脅威の PT（HUD の方角・端の矢印）: 航過中 → 警戒・突撃の最寄り → 離脱の最寄り → 哨戒の最寄り。去っていない PT が無ければ −1。距離二乗・確保なし */
export function threatIndex(q: PtSection, x: number, y: number): number {
  if (q.owner >= 0) return q.owner;
  let best = nearestIn(q, x, y, PT_ALERT, PT_RUN_IN);
  if (best < 0) best = nearestIn(q, x, y, PT_BREAK, PT_BREAK);
  if (best < 0) best = nearestIn(q, x, y, PT_PATROL, PT_PATROL);
  return best;
}

/** 段階が lo〜hi の PT のうち (x, y) に最も近いもの（無ければ −1） */
function nearestIn(q: PtSection, x: number, y: number, lo: number, hi: number): number {
  let best = -1;
  let best2 = Infinity;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (b.phase < lo || b.phase > hi) continue;
    const d2 = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
    if (d2 < best2) {
      best2 = d2;
      best = i;
    }
  }
  return best;
}
