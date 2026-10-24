// 敵の米PT の隊（v0.6.3。docs/02 §6.4）の定数・型・状態の確保と読み出し（core/pt-boats から分けた。300 行を超えないため。air-strike-state と同じ形）。Phaser 非依存。
// 確保は createPtSection・createPtTelemetry だけ（出撃の組み立てのとき）。段階の進め方は pt-boats.ts。攻撃の数え（countPass）もここ。使う側は core/pt-boats だけを import する（ここを出し直している）。
import type { BoatState } from './boat-motion';
import type { PtParams } from './pt-data';
import { createShells, type ShellState } from './shells';
import type { SmokeParams, SmokeState } from './smoke';

/** 米PT の乱数の系列（seed+18。射撃の散布と命中の火災・機関だけ。+17 は見張り、+16 は今夜の揺らぎ、+19 は夜明けの空襲、+20 は T-14 の 13mm。+21 は大発の 13mm の撃ち返し（v0.6.5 候補）に予約） */
export const PT_SEED_OFFSET = 18;
/** T-14 の 13mm の乱数の系列（seed+20。v0.6.3 実機 1 回目。1 発 2 回・生きた PT への命中 1 回。米PT の隊で艇に砲がある任務（jp_05）だけ作る） */
export const PT_GUN_SEED_OFFSET = 20;

/**
 * 段階: 哨戒 → 警戒 → 突撃 → 航過 → 離脱（→ 突撃）→ 去る → 海域の外（v0.6.3 実機 1 回目から、どの段階からも沈む）。
 * v0.6.3 実機 2 回目: 追撃（PT_CHASE）を離脱と去るの間に入れ、去る・海域の外・沈んだを 5/6/7 → 6/7/8 に付け直した。まだ戦う段階（< PT_LEAVE）は ptFighting で見る
 */
export const PT_PATROL = 0;
export const PT_ALERT = 1;
export const PT_RUN_IN = 2;
export const PT_PASS = 3;
export const PT_BREAK = 4;
/** 追撃（v0.6.3 実機 2 回目。逃げる艇の後ろ寄りの舷へ回って並ぶ。撃たない。撃つのは PT_PASS の連射＝burst。core/pt-chase） */
export const PT_CHASE = 5;
export const PT_LEAVE = 6;
export const PT_OUT = 7;
/** 沈んだ（v0.6.3 実機 1 回目。T-14 の 13mm でガソリンに引火）。去った（≥ PT_LEAVE）の側に数え、動かず・撃たず・脅威の PT にもならない */
export const PT_SUNK = 8;

/** まだ戦う段階（哨戒〜追撃。去る・海域の外・沈んだは false）: 見つける・接触・13mm の標的・HUD の「まだ戦う PT」 */
export function ptFighting(phase: number): boolean {
  return phase < PT_LEAVE;
}

/** 13mm を受けた結末（v0.6.3 実機 1 回目。core/pt-damage）: 無し・死傷で撃退・穴だらけで撃退・撃沈 */
export const PT_FATE_NONE = 0;
export const PT_FATE_CREW = 1;
export const PT_FATE_HULL = 2;
export const PT_FATE_SUNK = 3;

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
  /** T-14 の 13mm を受けた（v0.6.3 実機 1 回目）: HP（boat_ref の hull_hp から）・結末（PT_FATE_*）・受けた命中の数 */
  hp: number; fate: number; hitsTaken: number;
  /** 追撃（v0.6.3 実機 2 回目。core/pt-chase）: 今の PT_PASS が連射・使った連射（制圧で 1 回分）・目標が遅い秒・追撃中に受けた 13mm・制圧された・艇首の円錐に艇がいる秒 */
  burst: boolean; bursts: number; slowS: number; chaseHits: number; suppressed: boolean; coneS: number;
}

export interface PtSection {
  boats: PtBoatState[];
  shells: ShellState[];
  /** このステップに艇を見た PT（1）。隊として捉えている（見失って detectHoldS 経つまで） */
  seen: Uint8Array;
  detected: boolean;
  holdLeftS: number;
  /** 最後に見た艇の位置・速度（game m/s）とそれからの体感秒（見えていない間はここから推す）、そのときの艇首の向き deg（止まった艇の位置取りの基準。レビュー R3） */
  lkX: number; lkY: number; lkVx: number; lkVy: number; lkAgeS: number; lkHeadingDeg: number;
  /** 航過中の PT（−1 は無し）、次の航過を固められるまでの体感秒、固めたときのかわす向き（−1 左・0 そのまま・+1 右）と逃げる針路 deg（HUD の「北西へ転舵」） */
  owner: number; gapLeftS: number; dodge: number; escapeDeg: number;
  /**
   * 今の航過の命中・終わった航過の通し番号（HUD の結果の表示）・最後の航過の命中と撃ったか・その PT（後から落ちた弾もその航過に数える）・固めた時刻。
   * 通し番号は航過の終わりに撃った弾がまだ飛んでいれば、みな落ちてから増やす（seqPending。「かわした！」が後から「被弾」に変わらない）
   */
  passHits: number; passSeq: number; seqPending: boolean; lastPassHits: number; lastPassFired: boolean; lastPassBoat: number; commitAtS: number;
  /** 突撃の狙いの点（使い回し） */
  aim: { x: number; y: number };
  /** KPI: 航過（撃った・無傷）・発射・命中、最初に見つけた距離 m（NaN は無し）、見失わせた回数、予告から初弾までの最短秒、最接近の二乗、去った数、夜明けに去った */
  passes: number; firedPasses: number; cleanPasses: number; shots: number; hits: number;
  firstDetectM: number; lostContacts: number; minWarnS: number; closest2: number; out: number; leftAtDawn: boolean;
  /** 挟み撃ち（v0.6.3 実機 1 回目）: 最後に航過を固めた PT が艇のどちらの舷にいたか（+1 右・−1 左）、待っている PT（1。他の PT の航過中か次の航過まで） */
  ownerFlank: number; held: Uint8Array;
  /** T-14 の 13mm（v0.6.3 実機 1 回目）: PT への命中・撃退・撃沈の数、最初に見つかったのが閃光だった、出来事（HUD の 2 行目）の通し番号・種類（PT_GUN_EV_*）・PT */
  gunHits: number; retired: number; sunk: number; flashFirst: boolean; gunEventSeq: number; gunEvent: number; gunEventBoat: number;
  /** 追撃（v0.6.3 実機 2 回目）: 撃った連射（firedPasses の内）・連射の命中（後から落ちた弾も）・制圧の数（HUD の出来事は gunEventSeq）、最後に終えた攻撃が連射、最後に連射を撃った PT とそれが続けて撃てるまでの秒 */
  bursts: number; firedBursts: number; burstHits: number; suppressions: number; lastPassBurst: boolean; lastBurstBoat: number; selfGapLeftS: number;
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
  /** 艇の 13mm の閃光が見える距離 m（v0.6.3 実機 1 回目。撃ったステップだけ。0 か無しは撃っていない。detect_from_s の前は見つけない） */
  flashM?: number;
  /** 閃光の位置（v0.6.4。標的が大発でも自艇の砲の閃光は自艇から）。無ければ boat の位置（jp_05: 同じ式・同じ値） */
  flashX?: number;
  flashY?: number;
  /**
   * 弾が当たる船体の集合（v0.6.4。味方の大発を守る任務だけ。[0] は自艇）: 着弾はこの配列の valid な船体を index 順に見て最初に当たった 1 つに当て、その index を onImpact の hull に渡す。
   * 無ければ（jp_05）boat 1 隻だけ＝v0.6.3 の式と 3 引数の onImpact そのまま
   */
  targets?: readonly PtHull[];
}

/** 掃射の弾が当たる船体（v0.6.4。core/pt-target の標的スロットの材料）: 位置と向き、当たりの半長・半幅 m、浮いていて的になる（世界が毎ステップ書く） */
export interface PtHull {
  boat: BoatState;
  halfLengthM: number;
  halfBeamM: number;
  valid: boolean;
}

/** 呼ぶ側への知らせ（引数は数と真偽だけ） */
export interface PtEvents {
  onContact(gained: boolean): void;
  onCommit(i: number, lockDeg: number, dodge: number): void;
  onFire(i: number, x: number, y: number): void;
  /** 着弾。hit なら船体に当たった。hull は当たった船体の index（v0.6.4。PtCheck.targets の無い任務は渡さない＝自艇） */
  onImpact(x: number, y: number, hit: boolean, hull?: number): void;
  onPassEnd(i: number, fired: boolean, hits: number): void;
  onLeave(i: number): void;
  onOut(i: number): void;
}

/** HUD に渡す米PT の状態（systems/pt-telemetry が毎フレーム中身だけ書く。米PT の無い任務は enabled false のまま） */
export interface PtTelemetry {
  enabled: boolean;
  /** 隻数・去っていない（< 去る）・海域の外へ出た */
  total: number; alive: number; out: number;
  /** 隊が捉えている・航過中・その航過で撃った・かわす向き（0 は「そのまま」）と逃げる針路 deg（航過中でなければ NaN）・脅威の PT の段階（−1 は無し） */
  detected: boolean; passing: boolean; fired: boolean; dodge: number; escapeDeg: number; threatPhase: number;
  /** 艇から脅威の PT へ（m。無ければ NaN）、それが見えている（視程の内） */
  dx: number; dy: number; sighted: boolean;
  /** 隊の航過の数と上限（count × max_passes）、終わった航過の通し番号、最後の航過の命中と撃ったか（撃たなかった航過は「かわした！」を出さない）、1 発の HP、夜明けに去った */
  passes: number; maxPasses: number; passSeq: number; lastPassHits: number; lastPassFired: boolean; damagePerHit: number; leftAtDawn: boolean;
  /** 出撃のときに 1 回: 艇の静音の上限 kt・去る方角（東など） */
  silentMaxKt: number; leaveDirJa: string;
  /**
   * T-14 の 13mm（v0.6.3 実機 1 回目。砲の無い任務は gunEnabled false のまま）: 状態（GUN_* と PT_GUN_RELOAD）・速くて散る・標的までの m・PT への命中・今夜撃った・
   * 弾倉の交換の残り秒、出撃のときに 1 回の射程と有効射程 m
   */
  gunEnabled: boolean; gunStatus: number; gunFast: boolean; gunTargetM: number; gunHits: number; gunEverFired: boolean; reloadLeftS: number; gunRangeM: number; gunEffectiveM: number;
  /** 13mm の出来事の通し番号と種類（PT_GUN_EV_*）とその PT、まだ戦う PT（去っていない・結末なし）の数、沈めた数、航過中の PT が被弾で黙った（撃退か、連射なら制圧も）・撃退で黙った */
  gunEventSeq: number; gunEvent: number; gunEventBoat: number; fighting: number; sunk: number; passSilenced: boolean; passRetired: boolean;
  /**
   * 追撃（v0.6.3 実機 2 回目）: 航過中の攻撃が連射・最後に終えた攻撃が連射とその PT（ui/pt-line-clock が 13mm の出来事と同じ PT の連射の結果を 1 行にまとめる）・撃った連射の数・
   * 攻撃が終わって弾がまだ飛んでいる（隊の seqPending。ui/pt-chase-lines の ptHoldPass）
   */
  burst: boolean; burstFired: boolean; lastPassBoat: number; bursts: number; resultPending: boolean;
  /** 隊の今の標的と最後に終えた攻撃の標的（v0.6.4。0 自艇・1 大発。米PT の標的スロットの無い任務は 0 のまま）: HUD の航過・突撃・結果の文を切り替える */
  targetKind: number; lastPassTargetKind: number;
  /**
   * v0.6.4 レビュー（標的スロットの無い任務は false のまま）: 航過中の標的の大発が沈んだ・上陸した（赤い線の行を降ろし、沈没・上陸の出来事を先に出す。ux-3）、
   * 最後に終えた攻撃の PT が撃つ前に 25mm で黙った（大発への航過の結果「大発を守った！」。ux-7）
   */
  passTargetLost: boolean; lastPassSilenced: boolean;
}

export function createPtTelemetry(): PtTelemetry {
  return {
    enabled: false, total: 0, alive: 0, out: 0, detected: false, passing: false, fired: false, dodge: 0, escapeDeg: NaN, threatPhase: -1, dx: NaN, dy: NaN, sighted: false,
    passes: 0, maxPasses: 0, passSeq: 0, lastPassHits: 0, lastPassFired: false, damagePerHit: 0, leftAtDawn: false, silentMaxKt: NaN, leaveDirJa: '',
    gunEnabled: false, gunStatus: 0, gunFast: false, gunTargetM: 0, gunHits: 0, gunEverFired: false, reloadLeftS: 0, gunRangeM: NaN, gunEffectiveM: NaN,
    gunEventSeq: 0, gunEvent: 0, gunEventBoat: -1, fighting: 0, sunk: 0, passSilenced: false, passRetired: false, burst: false, burstFired: false, lastPassBoat: -1, bursts: 0, resultPending: false,
    targetKind: 0, lastPassTargetKind: 0, passTargetLost: false, lastPassSilenced: false,
  };
}

/** 出発点に哨戒で並べる（今夜の揺らぎは p に入っている）。shellPoolSize は弾の数（config/pt-config の PT_SHELL_POOL_SIZE） */
export function createPtSection(p: PtParams, shellPoolSize: number): PtSection {
  const boats: PtBoatState[] = [];
  for (let i = 0; i < p.count; i++) {
    boats.push({ x: p.startX[i]!, y: p.startY[i]!, headingDeg: p.startHeadingDeg[i]!, speedMps: p.patrolMps, phase: PT_PATROL, wp: 1, timerS: 0, side: 1, lockDeg: 0, passMps: 0, passes: 0, cooldownS: 0, roundsLeft: 0, firedThisPass: 0, hp: p.hullHp, fate: PT_FATE_NONE, hitsTaken: 0, burst: false, bursts: 0, slowS: 0, chaseHits: 0, suppressed: false, coneS: 0 });
  }
  return {
    boats, shells: createShells(shellPoolSize), seen: new Uint8Array(p.count), detected: false, holdLeftS: 0,
    lkX: 0, lkY: 0, lkVx: 0, lkVy: 0, lkAgeS: 0, lkHeadingDeg: 0, owner: -1, gapLeftS: 0, dodge: 0, escapeDeg: NaN,
    passHits: 0, passSeq: 0, seqPending: false, lastPassHits: 0, lastPassFired: false, lastPassBoat: -1, commitAtS: NaN, aim: { x: 0, y: 0 },
    passes: 0, firedPasses: 0, cleanPasses: 0, shots: 0, hits: 0, firstDetectM: NaN, lostContacts: 0, minWarnS: Infinity, closest2: Infinity, out: 0, leftAtDawn: false,
    ownerFlank: 1, held: new Uint8Array(p.count), gunHits: 0, retired: 0, sunk: 0, flashFirst: false, gunEventSeq: 0, gunEvent: 0, gunEventBoat: -1,
    bursts: 0, firedBursts: 0, burstHits: 0, suppressions: 0, lastPassBurst: false, lastBurstBoat: -1, selfGapLeftS: 0,
  };
}

/** 脅威の順（段階 lo・hi・待っているか held。held −1 は問わない、0 は待っていない、1 は待っている。q.held は突撃の PT だけが書く）。module に 1 個ずつ、確保しない */
const SIM_THREAT = [PT_CHASE, PT_CHASE, -1, PT_ALERT, PT_RUN_IN, -1, PT_BREAK, PT_BREAK, -1, PT_PATROL, PT_PATROL, -1] as const;
const HUD_THREAT = [PT_ALERT, PT_RUN_IN, 0, PT_CHASE, PT_CHASE, -1, PT_ALERT, PT_RUN_IN, 1, PT_BREAK, PT_BREAK, -1, PT_PATROL, PT_PATROL, -1] as const;

/** 脅威の PT（模擬の台本の構え）: 撃っている（航過・連射）→ 追撃の最寄り → 警戒・突撃の最寄り → 離脱の最寄り → 哨戒の最寄り。去っていない PT が無ければ −1。距離二乗・確保なし */
export function threatIndex(q: PtSection, x: number, y: number): number {
  return threatBy(q, x, y, SIM_THREAT);
}

/**
 * HUD の脅威の PT（2 行目の方角と距離・端の矢印。実機 2 回目のレビュー ux-5）: 撃っている → 待っていない警戒・突撃（次の航過の PT）→ 追撃 → 待っている警戒・突撃 → 離脱 → 哨戒。
 * threatIndex（spec r2 §D.1 の順）だと、追ってくる PT がいる間は航過に来る PT の「…から突撃」が 2 行目に出なかった。模擬の構えは threatIndex のまま（表は変わらない）
 */
export function hudThreatIndex(q: PtSection, x: number, y: number): number {
  return threatBy(q, x, y, HUD_THREAT);
}

function threatBy(q: PtSection, x: number, y: number, order: readonly number[]): number {
  if (q.owner >= 0) return q.owner;
  for (let k = 0; k < order.length; k += 3) {
    const i = nearestIn(q, x, y, order[k]!, order[k + 1]!, order[k + 2]!);
    if (i >= 0) return i;
  }
  return -1;
}

/** 段階が lo〜hi（held が 0・1 なら q.held もそれ）の PT のうち (x, y) に最も近いもの（無ければ −1） */
function nearestIn(q: PtSection, x: number, y: number, lo: number, hi: number, held: number): number {
  let best = -1;
  let best2 = Infinity;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (b.phase < lo || b.phase > hi || (held >= 0 && q.held[i] !== held)) continue;
    const d2 = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
    if (d2 < best2) {
      best2 = d2;
      best = i;
    }
  }
  return best;
}

/**
 * 攻撃（航過・連射）を数える（counts が false なら航過の回数には入れない。連射はいつも false）: 撃った攻撃・無傷の攻撃、最後の攻撃の命中・撃ったか・連射か・その PT（後から落ちた弾の数え先）。
 * core/pt-pass-end の endPass・dropOwner、core/pt-chase の連射の終わり、pt-boats の夜明けが呼ぶ（pt-pass-end と pt-chase が互いに import しないようここに置く）
 */
export function countPass(q: PtSection, b: PtBoatState, i: number, counts: boolean): void {
  const fired = b.firedThisPass > 0;
  if (counts) {
    b.passes++;
    q.passes++;
  }
  if (fired) q.firedPasses++;
  if (fired && q.passHits === 0) q.cleanPasses++;
  q.lastPassHits = q.passHits;
  q.lastPassFired = fired;
  q.lastPassBurst = b.burst;
  q.lastPassBoat = i;
}
