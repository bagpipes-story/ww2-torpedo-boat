// 隊の艦ごとの値（v0.8.2 S2。us_05「スリガオ海峡・最初の接触」の列の艦ごとの記録＝spec-v0820 §4.2 D-C3・§9 の 1・11、lead の L19）: 隊（systems/destroyer-group）の constructor が 1 回だけ組み、
// 砲（gunneryAt）・命中率の KPI の旗（kpiAt＝Uint8Array を読むだけ）・レーダーの種類（radarKindAt）・絵の鍵・艦種（片道の列の任務だけ）を艦の添字で引く。並びは護衛 → 列 → 輸送船 → 駆潜艇。
// 今の任務（列の艦ごとの記録 transit.column の無い任務）は今の 3 つ組の値をそのまま入れる: 砲は駆逐艦（護衛と往復の列の艦）＝ds.gunnery・輸送船＝transport.gunnery・駆潜艇＝pickets.gunnery の同じ物、
// KPI の旗は駆逐艦（添字 < destroyerCount）だけ 1、レーダーの種類は駆潜艇だけ小さい艇、絵の鍵は駆逐艦＝隊に渡った鍵・輸送船＝輸送船の鍵・駆潜艇＝記録の id から（v0.8.1 の destroyer-group の式と同じ値）。
// 片道の列（us_05）の艦は kits の値（記録ごとの砲・KPI の旗＝駆逐艦の記録だけ・絵の鍵＝S2 は記録の表に無ければ既定の駆逐艦の絵）。列の艦を作る値（寸法・列の AI・砲・絵の鍵）は columnShipKit。
// Phaser・DOM を読まない（絵の鍵は呼ぶ側が渡す）・乱数なし。確保は組む時の 1 回だけ（毎ステップは配列を読むだけ）。
import type { ColumnKit, ShipClass } from '../config/column-mission-data';
import { shipArtKey } from '../config/ship-art-config';
import type { GunneryParams } from '../core/gunnery';
import { RADAR_KIND_SHIP, RADAR_KIND_SMALL } from '../core/radar';
import type { ShipAiParams } from '../core/ship-ai';
import type { DestroyerSetup, DestroyerSpec, PicketSetup, TransportSetup } from './destroyer-setup';

/** 隊の艦ごとの値（長さは隊の隻数） */
export interface GroupKits {
  readonly guns: readonly GunneryParams[];
  /** 1＝命中率の KPI に数える艦（今の任務は駆逐艦・片道の列は駆逐艦の記録の艦だけ） */
  readonly kpi: Uint8Array;
  /** core/radar の RADAR_KIND_*（駆潜艇だけ小さい艇） */
  readonly radarKind: Uint8Array;
  readonly artKeys: readonly string[];
  /** 艦種（片道の列の任務だけ。列の無い任務・往復の列は null＝今の任務の文は駆逐艦のまま） */
  readonly classes: readonly ShipClass[] | null;
}

/** 隊の並び（destroyer-group の添字。first は列の 1 隻目＝護衛の隻数、destroyerCount は護衛 ＋ 列、無い物は −1） */
export interface GroupShape {
  readonly total: number;
  readonly first: number;
  readonly destroyerCount: number;
  readonly transportIndex: number;
  readonly picketIndex: number;
}

/** 列の艦 1 隻を作る値（Destroyer と EnemyFire の引数） */
export interface ColumnShipKit {
  readonly spec: DestroyerSpec;
  readonly ai: ShipAiParams;
  readonly gunnery: GunneryParams;
  readonly artKey: string;
}

/** 列の i 隻目の値: 片道の列は kits の i 番目（寸法・列の AI・砲・絵の鍵）、往復の列（us_04）は護衛と同じ寸法・砲・絵と列の速さの AI（今の式の同じ物） */
export function columnShipKit(ds: DestroyerSetup, lineAi: ShipAiParams, column: readonly ColumnKit[] | undefined, i: number, destroyerArt: string): ColumnShipKit {
  const k = column ? column[i] : undefined;
  return k ? { spec: k.spec, ai: k.lineAi, gunnery: k.gunnery, artKey: k.artKey } : { spec: ds.spec, ai: lineAi, gunnery: ds.gunnery, artKey: destroyerArt };
}

/**
 * 隊の通過の半径の 2 乗（無ければ base のまま＝今の任務）。片道の列（kits のある列＝us_05）は Infinity（v0.8.2 IP1。実機 1 回目のユーザー「魚雷が船体の下を通ってしまうことが多くなった」）:
 * 凍結の systems/torpedo-pool は走る魚雷を「最寄りの浮いている艦の中心から通過の半径の外へ遠ざかり始めた」ステップで外れに決め、以後は当たりを見ない。
 * 道の違う 7 隻の列では最寄りが別の艦（前の時雨・前の戦艦）のうちに外れに決まり、その魚雷が後ろの艦の絵の下を抜けた（ヘッドレスの測り: 476 本のうち 100 本）。
 * 片道の列では通り過ぎで決めず、射程の終わり・海の外・列のすべてが出た時に決める（走る魚雷は当たる艦があれば当たる）。
 */
export function columnPassRadius2(base: number, column: readonly ColumnKit[] | undefined): number {
  return column ? Infinity : base;
}

/** 隊の艦ごとの値を組む（constructor で 1 回）。destroyerArt は護衛と往復の列の絵の鍵・transportArt は輸送船の絵の鍵（呼ぶ側の TEXTURE_KEYS） */
export function groupKits(g: GroupShape, ds: DestroyerSetup, transport: TransportSetup | null, pickets: PicketSetup | null, column: readonly ColumnKit[] | undefined, destroyerArt: string, transportArt: string): GroupKits {
  const guns: GunneryParams[] = [];
  const artKeys: string[] = [];
  const kpi = new Uint8Array(g.total);
  const radarKind = new Uint8Array(g.total);
  const classes: ShipClass[] | null = column ? [] : null;
  for (let i = 0; i < g.total; i++) {
    const k = column && i >= g.first && i < g.destroyerCount ? column[i - g.first] : undefined;
    if (i < g.destroyerCount) {
      guns.push(k ? k.gunnery : ds.gunnery);
      artKeys.push(k ? k.artKey : destroyerArt);
      kpi[i] = k ? (k.kpi ? 1 : 0) : 1;
    } else if (i === g.transportIndex) {
      guns.push(transport!.gunnery);
      artKeys.push(transportArt);
    } else {
      guns.push(pickets!.gunnery);
      artKeys.push(shipArtKey(pickets!.enemyId));
    }
    radarKind[i] = g.picketIndex >= 0 && i >= g.picketIndex ? RADAR_KIND_SMALL : RADAR_KIND_SHIP;
    classes?.push(k ? k.shipClass : 'destroyer');
  }
  return { guns, kpi, radarKind, artKeys, classes };
}
