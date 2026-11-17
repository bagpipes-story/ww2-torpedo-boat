// 暗い岸を背に（v0.8.1 S2。us_06「オルモック湾の決着」。spec-v0810 §3.3 D-B1・D-B4・D-B5、lead の L34）の世界の側: 隊の艦ごとの、このステップに自艇を見つける距離。
// 隊（systems/destroyer-group）が setup.backdrop の任務だけ持ち（world-enemies が作った後に 1 回付ける）、固定ステップの艦の段（systems/destroyer-step）で艦ごとに rangeFor を呼ぶ:
//   照らされている（HUD の「照らされている」と同じ w.enemy.illuminated＝隊のどれかの探照灯・星弾・照明弾の光の中）間は世界の距離のまま（光の中では背景が効かない）。
//   そうでなく、艦から自艇への線を自艇の向こうへ伸ばして behind_m の内で陸の岸の線に当たれば（core/strait-geometry の landBehind）、世界の距離 × detect_factor。
//   ただし下限は機銃の閃光（arms の flashM。閃光の間だけ）と水上機の照明弾（照らされている間だけ）の距離＝世界の距離に既に入っている上書きを係数で切らない。
// 世界の距離（w.detectRangeM）は今のまま（速力帯・月・煙幕・暴風・史実モード・閃光・照明弾込み）＝煙幕とは掛け算。block の無い任務は隊が null を持ち、destroyer-step は世界の距離そのものを渡す。
// 艦ごとの「背に岸が効いた」ビット（behindMask）と最後の距離（rangeAt。HUD の 3 行目＝D-B5 と anchor-telemetry の背に岸の秒）を残す。
// Phaser 非依存・乱数なし。確保は constructor だけ（判定は 2 乗の比べと割り算 1 回＝平方根・atan2 なし）。
import type { BackdropSetup } from '../config/backdrop-mission-data';
import { landBehind, type LandLine } from '../core/strait-geometry';

/** 艦ごとの判定で読む世界の部分（MissionWorld がそのまま満たす） */
export interface BackdropWorldView {
  /** 世界の見つける距離（このステップ。閃光・照明弾の上書き込み） */
  readonly detectRangeM: number;
  /** 照らされている（HUD の 3 行目と同じ。systems/enemy-side） */
  readonly enemy: { readonly illuminated: boolean };
  /** 水上機の照明弾の光の中（無い任務はいつも false） */
  readonly flareLit: boolean;
  /** 兵装（閃光の距離。閃光が無ければ 0）。艇が魚雷も砲も積まなければ null */
  readonly arms: { readonly flashM: number } | null;
}

export class ShoreBackdrop {
  /** 艦ごとの「このステップに背に岸が効いた」（bit i＝隊の艦 i。照らされていれば立たない） */
  behindMask = 0;
  /** 艦ごとの最後に渡した距離 m（NaN はまだ）。長さは隊の隻数 */
  private readonly lastM: Float64Array;

  constructor(
    readonly p: BackdropSetup,
    /** 任務の岸の線（core/strait-geometry の landLinesOf。world-enemies が起動時に 1 回作る） */
    readonly lines: readonly LandLine[],
    /** 隊の隻数 */
    ships: number,
    /** 水上機の照明弾の距離（setup.seaplane の flareRevealM。今夜の水上機が無ければ 0） */
    private readonly flareRevealM: number,
  ) {
    this.lastM = new Float64Array(ships).fill(NaN);
  }

  /** 艦 i（位置 ship）がこのステップに自艇（boat）を見つける距離 m。艦の段で艦ごとに 1 回（確保しない） */
  rangeFor(i: number, ship: { readonly x: number; readonly y: number }, boat: { readonly x: number; readonly y: number }, w: BackdropWorldView): number {
    const base = w.detectRangeM;
    const bit = 1 << i;
    let r = base;
    if (!w.enemy.illuminated && landBehind(this.lines, ship.x, ship.y, boat.x, boat.y, this.p.behindM2)) {
      const flash = w.arms ? w.arms.flashM : 0;
      const flare = w.flareLit ? this.flareRevealM : 0;
      const scaled = base * this.p.detectFactor;
      const floor = flash > flare ? flash : flare;
      r = scaled > floor ? scaled : floor;
      this.behindMask |= bit;
    } else {
      this.behindMask &= ~bit;
    }
    this.lastM[i] = r;
    return r;
  }

  /** 艦 i に最後に渡した距離 m（i < 0・まだ渡していなければ fallback）。HUD の 3 行目（D-B5）の最寄りの艦の値 */
  rangeAt(i: number, fallback: number): number {
    const v = i >= 0 && i < this.lastM.length ? this.lastM[i]! : NaN;
    return Number.isNaN(v) ? fallback : v;
  }
}
