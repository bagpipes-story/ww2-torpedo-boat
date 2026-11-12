// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §8・D6）: 音のオン／オフの保存。localStorage の鍵 1 つ（'0' で消音。無い・読めなければ音オン）。
// progress-storage の見越し点マーカー（leadMarkerEnabled）と同じ作法: 読めない・書けない（プライベートブラウズ・容量・無効）時も例外を外へ出さない。update では触らない（§7）。
// 違う所: 選んだ値はこのページの間は覚えておく（保存が効かない端末でも「音: オフ」が効く。開き直すと音オンに戻る）。
// iOS の注意: Safari とホーム画面のアプリ（PWA）は保存場所が別。
import { SFX_STORAGE_KEY } from '../config/sfx-config';
import { sfxSetMuted, sfxUi } from './sfx-bus';

/** このページで選んだ値（まだ選んでいなければ null＝保存を読む） */
let chosen: boolean | null = null;

/** 音を鳴らす設定か（既定はオン） */
export function soundEnabled(): boolean {
  if (chosen !== null) return chosen;
  try {
    return globalThis.localStorage?.getItem(SFX_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** 音のオン／オフを選ぶ（Title・一時停止の「音」ボタン）: 覚えて、エンジンの消音を切り替え、オンにした時はボタンの音を鳴らす（止まっている context もここで起こす） */
export function setSoundEnabled(v: boolean): void {
  chosen = v;
  try {
    globalThis.localStorage?.setItem(SFX_STORAGE_KEY, v ? '1' : '0');
  } catch {
    // 覚えないだけ
  }
  sfxSetMuted(!v);
  if (v) sfxUi('ui_tap');
}

/** tests: このページで選んだ値を忘れる */
export function forgetSoundChoice(): void {
  chosen = null;
}
