// v0.7.1 S1（アートと音②：合成の効果音。spec-v0710 §8・D6）: 音のオン／オフの保存。localStorage の鍵 1 つ（'0' で消音。無い・読めなければ音オン）。
// progress-storage の見越し点マーカー（leadMarkerEnabled）と同じ作法: 読めない・書けない（プライベートブラウズ・容量・無効）時も例外を外へ出さない。update では触らない（§7）。
// 違う所: 選んだ値はこのページの間は覚えておく（保存が効かない端末でも「音: オフ」が効く。開き直すと音オンに戻る）。
// iOS の注意: Safari とホーム画面のアプリ（PWA）は保存場所が別。
// v0.7.2 S1（spec-v0720 D7・brief L12）: 「曲: オン／オフ」も同じ作法で別の鍵 night-hunters.music（'0' でオフ・既定オン）。「音」とは別に切り替え・別に覚える
// （「音: オフ」の間は曲も鳴らない＝master が 0。曲だけ止めたい時が「曲: オフ」）。読み書きは下の 2 つの関数の 1 か所ずつ。
import { SFX_STORAGE_KEY } from '../config/sfx-config';
import { MUSIC_STORAGE_KEY } from '../config/sfx-music-config';
import { sfxMusicEnabled, sfxSetMuted, sfxUi } from './sfx-bus';

/** このページで選んだ値（まだ選んでいなければ null＝保存を読む）: 音・曲 */
let chosen: boolean | null = null;
let chosenMusic: boolean | null = null;

/** 保存の値（'0' だけがオフ。無い・読めなければオン） */
function storedOn(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) !== '0';
  } catch {
    return true;
  }
}

/** 保存する（書けなければ覚えないだけ） */
function store(key: string, v: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, v ? '1' : '0');
  } catch {
    // 覚えないだけ
  }
}

/** 音を鳴らす設定か（既定はオン） */
export function soundEnabled(): boolean {
  return chosen !== null ? chosen : storedOn(SFX_STORAGE_KEY);
}

/** 音のオン／オフを選ぶ（Title・一時停止の「音」ボタン）: 覚えて、エンジンの消音を切り替え、オンにした時はボタンの音を鳴らす（止まっている context もここで起こす） */
export function setSoundEnabled(v: boolean): void {
  chosen = v;
  store(SFX_STORAGE_KEY, v);
  sfxSetMuted(!v);
  if (v) sfxUi('ui_tap');
}

/** 曲を鳴らす設定か（既定はオン。v0.7.2 S1） */
export function musicEnabled(): boolean {
  return chosenMusic !== null ? chosenMusic : storedOn(MUSIC_STORAGE_KEY);
}

/** 曲のオン／オフを選ぶ（Title・一時停止の「曲」ボタン）: 覚えて、曲の再生に渡す（オフは 0.3 秒で消して止め、オンで今の場面の曲を頭から。ボタンの音は MenuButton が鳴らす） */
export function setMusicEnabled(v: boolean): void {
  chosenMusic = v;
  store(MUSIC_STORAGE_KEY, v);
  sfxMusicEnabled(v);
}

/** tests: このページで選んだ値を忘れる */
export function forgetSoundChoice(): void {
  chosen = null;
}
export function forgetMusicChoice(): void {
  chosenMusic = null;
}
