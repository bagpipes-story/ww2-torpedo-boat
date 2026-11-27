// Briefing の「装備: デフォルト／カスタム」（v0.9.0 S1。ユーザーの決め U1 の語）: 出撃の左 16 の 400 × 112 のボタン。出すかどうかは systems/sortie-loadout の briefingLoadout
// （ストアが開いていて・空襲の 2 択が無く・その任務に効く装着中の品がある時だけ。v0.9.0 IP1 から史実モードでも出す）。押すと選びを保存して Briefing を作り直す（数値の行をカスタムの値で組み直す）。
// 作るのは Briefing の create の 1 回だけ（§7）。
import type Phaser from 'phaser';
import { GAME_WIDTH } from '../config/game-config';
import type { GameData } from '../config/game-data';
import { getStoreCatalogue, storeItemById } from '../config/store-data';
import {
  BRIEF_LOADOUT_CUSTOM_JA,
  BRIEF_LOADOUT_DEFAULT_JA,
  BRIEF_LOADOUT_DEFAULT_SUB_JA,
  BRIEF_LOADOUT_PX,
  BRIEF_LOADOUT_SUB_PX,
  briefLoadoutRect,
} from '../config/store-layout-config';
import type { BriefingLoadout } from '../systems/sortie-loadout';
import { MenuButton } from './menu-ui';
import { loadoutSubJa } from './store-texts';

/** 切り替えのボタン（出さない時は undefined）。カスタムの時は枠を強く、2 行目に効く品の短い名 */
export function addLoadoutToggle(scene: Phaser.Scene, base: GameData, l: BriefingLoadout, onToggle: (custom: boolean) => void): MenuButton | undefined {
  if (!l.show) return undefined;
  const cat = getStoreCatalogue(base);
  const shorts = l.items.map((id) => storeItemById(cat, id)?.shortJa ?? id);
  const spec = {
    ...briefLoadoutRect(GAME_WIDTH),
    title: l.custom ? BRIEF_LOADOUT_CUSTOM_JA : BRIEF_LOADOUT_DEFAULT_JA,
    titlePx: BRIEF_LOADOUT_PX,
    sub: l.custom ? loadoutSubJa(shorts) : BRIEF_LOADOUT_DEFAULT_SUB_JA,
    subPx: BRIEF_LOADOUT_SUB_PX,
    align: 'center' as const,
  };
  const b = new MenuButton(scene, spec, () => onToggle(!l.custom));
  b.setSelected(l.custom);
  return b;
}
