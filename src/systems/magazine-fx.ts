// v0.8.2 S2b（us_05「スリガオ海峡・最初の接触」の戦艦の弾薬庫。ユーザーの U1・spec-v0820 §4.11 D-A4・§9 の 8、lead の L31）: 誘爆（轟沈）の見た目の持ち主（絵だけ）。
// world-art が隊に弾薬庫（systems/ship-magazine）のある世界だけ作る（ほかの任務は作らない＝毎フレームの仕事なし）。世界・Scene・音の層には何も足さない（新しい出来事を通さない）:
// 毎フレーム、隊の弾薬庫の誘爆の数を前の数と比べるだけ（何も起きなければ O(1)）。増えたら記録（magazine.log の誘爆の秒）から新しく誘爆した艦を探し、その艦の位置・針路と絵の長さで:
//   0 秒 艦の中央に大きい爆発（explosion-fx の大きい版を MAGAZINE_BLAST_SIZE 倍。命中の点の魚雷の命中の見た目は今のまま Scene が出す）、
//   +0.25 秒 艦首の向きへ +0.3 L・+0.5 秒 −0.3 L に 2 次の爆発（今の secondary。2 段目の大きい版の途中の枠は飛ばす＝magazineSecondary）。沈む段（煙・炎・泡・沈没の 2 次の爆発）は今の fire-fx・sink-fx が出す。
// 音は explosion-fx の今の呼び方だけ（大きい版 blast_l・2 次 blast_s）。待つ 2 次の爆発は固定長の型付き配列（MAGAZINE_FX_PENDING 枠。尽きたら順に上書き）＝誘爆でも毎フレームでも確保しない。
// 時計は見た目の実秒（world-art の realDt）。論理の状態は読むだけ（tests/art-rules）。乱数は使わない。
import { MAGAZINE_BLAST_SIZE, MAGAZINE_FX_PENDING, MAGAZINE_SECONDARY_AT, MAGAZINE_SECONDARY_DELAY_S } from '../config/capital-art-config';

/** 爆発のプールの使う口（systems/explosion-fx の ExplosionFx がそのまま満たす。tests は偽物） */
export interface MagazineBlastPool {
  play(x: number, y: number, dud: boolean, torpedo?: boolean, size?: number): void;
  magazineSecondary(x: number, y: number): void;
}

/** 隊の弾薬庫の読む所（systems/ship-magazine の ShipMagazine がそのまま満たす） */
export interface MagazineView {
  readonly detonations: number;
  readonly log: { readonly n: number; readonly detonatedAtS: Float64Array };
}

/** 世界から読む物（MissionWorld がそのまま満たす。world-art の ArtWorldView に入る） */
export interface MagazineFxWorldView {
  readonly destroyers: {
    readonly magazine?: MagazineView | null;
    readonly ships: readonly { readonly state: { readonly x: number; readonly y: number; readonly headingDeg: number }; readonly sprite: { readonly displayHeight: number } }[];
  } | null;
}

type Ships = NonNullable<MagazineFxWorldView['destroyers']>['ships'];

export class MagazineFx {
  /** 見た誘爆の数（隊の通算） */
  private seen = 0;
  /** 艦ごと: 見せた誘爆（1）・絵の長さ（世界単位。作った時の絵から 1 回＝沈む tween で縮む前） */
  private readonly shown: Uint8Array;
  private readonly lenOf: Float64Array;
  /** 待つ 2 次の爆発（位置と残りの秒。Infinity は空き） */
  private readonly px = new Float64Array(MAGAZINE_FX_PENDING);
  private readonly py = new Float64Array(MAGAZINE_FX_PENDING);
  private readonly left = new Float64Array(MAGAZINE_FX_PENDING).fill(Infinity);
  private next = 0;
  private pending = 0;

  private constructor(private readonly pool: MagazineBlastPool, private readonly magazine: MagazineView, private readonly ships: Ships) {
    this.shown = new Uint8Array(magazine.log.n);
    this.lenOf = new Float64Array(magazine.log.n);
    for (let i = 0; i < magazine.log.n && i < ships.length; i++) this.lenOf[i] = ships[i]!.sprite.displayHeight;
    this.seen = magazine.detonations;
  }

  /** 隊に弾薬庫のある世界だけ作る（無ければ null＝world-art は毎フレーム何もしない） */
  static of(pool: MagazineBlastPool, w: MagazineFxWorldView): MagazineFx | null {
    const g = w.destroyers;
    return g && g.magazine ? new MagazineFx(pool, g.magazine, g.ships) : null;
  }

  /** 毎フレーム（world-art から。realDt は見た目の時計）: 待つ 2 次の爆発を進め、誘爆の数が増えていれば新しい誘爆を見せる */
  update(realDt: number): void {
    if (this.pending > 0) {
      for (let k = 0; k < MAGAZINE_FX_PENDING; k++) {
        const t = this.left[k]!;
        if (t === Infinity) continue;
        if (t - realDt > realDt / 2) this.left[k] = t - realDt; // 予定の秒に一番近いフレームで出す（半フレームの内）
        else {
          this.left[k] = Infinity;
          this.pending--;
          this.pool.magazineSecondary(this.px[k]!, this.py[k]!);
        }
      }
    }
    if (this.magazine.detonations !== this.seen) this.showNew();
  }

  /** 誘爆の数が増えた時だけ: 記録に誘爆の秒があり、まだ見せていない艦ごとに大きい爆発と 2 次の爆発の予約 */
  private showNew(): void {
    this.seen = this.magazine.detonations;
    const log = this.magazine.log;
    for (let i = 0; i < log.n && i < this.ships.length; i++) {
      if (this.shown[i] === 1 || Number.isNaN(log.detonatedAtS[i]!)) continue;
      this.shown[i] = 1;
      const s = this.ships[i]!.state;
      this.pool.play(s.x, s.y, false, false, MAGAZINE_BLAST_SIZE);
      const rad = (s.headingDeg * Math.PI) / 180;
      const fx = Math.sin(rad);
      const fy = -Math.cos(rad);
      for (let j = 0; j < MAGAZINE_SECONDARY_DELAY_S.length; j++) {
        const a = MAGAZINE_SECONDARY_AT[j]! * this.lenOf[i]!;
        this.schedule(s.x + fx * a, s.y + fy * a, MAGAZINE_SECONDARY_DELAY_S[j]!);
      }
    }
  }

  /** 2 次の爆発を 1 つ待たせる（空き枠。無ければ次の番の枠を順に上書き） */
  private schedule(x: number, y: number, delayS: number): void {
    let k = -1;
    for (let n = 0; n < MAGAZINE_FX_PENDING && k < 0; n++) if (this.left[n] === Infinity) k = n;
    if (k < 0) {
      k = this.next;
      this.next = (k + 1) % MAGAZINE_FX_PENDING;
    } else this.pending++;
    this.px[k] = x;
    this.py[k] = y;
    this.left[k] = delayS;
  }

  /** 待っている 2 次の爆発の数（tests） */
  get pendingCount(): number {
    return this.pending;
  }
}
