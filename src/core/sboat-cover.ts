// フィッチの砲火で S ボートが退く（v0.8.5 S1。us_07。spec-v0850 §4.4）: 凍結の core/pt-boats の stepPtSection の後（spec §4.0 の順）に 1 回。凍結の米PT の AI の 20 本は変えない。
// 去っていない・沈んでいない（< PT_LEAVE）S ボートがフィッチから cover_m の内に体感秒で cover_s 続けて居れば、その S ボートを去らせる（PT_LEAVE・timerS 0・onLeave）。
// 航過の中（PT_PASS）は航過が終わるまで待つ（内に居る秒は数え続け、航過を抜けた最初のステップに内に居ればすぐ去る。外へ出れば 0 に戻す）。
// 外から PT_LEAVE を書く書き方は core/pt-damage の hitPt が航過の外の PT に書くのと同じ（phase と timerS、onLeave）＝core/pt-torpedo の輸送船の沈没の枝と同じ。
// 隊の欄（owner・burst・held・相方・追撃の目標・連射）が宙に浮かないことは core/pt-torpedo の stepPtTorpedoes の沈没の枝の注のとおり: owner と burst は航過の中だけ
// （航過は待つ）・held を読む窓は警戒〜突撃で去るは戻らない・相方と標的は毎ステップ選び直す（tests/sboat-cover で凍結の隊を回して確かめる）。乱数は引かない。Phaser 非依存・毎ステップ確保しない。
import { PT_LEAVE, PT_PASS, type PtSection } from './pt-boats';

/** 時計の比べの許し（固定ステップの 1/60 秒の和の丸め。core/column-screen と同じ） */
const COVER_TIME_EPS_S = 1e-6;

/** core が読むフィッチの砲火の値（config/rescue-mission-data の RescueSetup.fitch がそのまま満たす） */
export interface SboatCoverRules {
  readonly x: number;
  readonly y: number;
  /** cover_m の 2 乗・cover_s（体感秒） */
  readonly cover2: number;
  readonly coverS: number;
}

/** 外から去らせた知らせ（世界は隊の onLeave と同じ扱い。凍結の PtEvents の onLeave と同じ形） */
export interface SboatCoverSink {
  onLeave(i: number): void;
}

export interface SboatCoverState {
  /** S ボートごとの続けて内に居る体感秒・フィッチの砲火で退いた（1） */
  inS: Float64Array;
  retreated: Uint8Array;
  /** 退いた数・その通し番号・最後に退いた S ボート（−1 は無し）・内に居て航過の終わりを待っている S ボートの数（このステップ） */
  count: number;
  seq: number;
  last: number;
  waiting: number;
}

export function createSboatCover(n: number): SboatCoverState {
  return { inS: new Float64Array(n), retreated: new Uint8Array(n), count: 0, seq: 0, last: -1, waiting: 0 };
}

/** 固定ステップに 1 回（凍結の stepPtSection の後）。feelDt は体感秒 */
export function stepSboatCover(st: SboatCoverState, r: SboatCoverRules, q: PtSection, feelDt: number, sink: SboatCoverSink): void {
  st.waiting = 0;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (b.phase >= PT_LEAVE) {
      st.inS[i] = 0;
      continue;
    }
    const dx = b.x - r.x;
    const dy = b.y - r.y;
    if (dx * dx + dy * dy > r.cover2) {
      st.inS[i] = 0;
      continue;
    }
    st.inS[i] = st.inS[i]! + feelDt;
    if (st.inS[i]! < r.coverS - COVER_TIME_EPS_S) continue;
    if (b.phase === PT_PASS) {
      st.waiting++;
      continue;
    }
    b.phase = PT_LEAVE;
    b.timerS = 0;
    st.inS[i] = 0;
    st.retreated[i] = 1;
    st.count++;
    st.seq++;
    st.last = i;
    sink.onLeave(i);
  }
}
