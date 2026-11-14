// 曲の試聴の場（v0.7.2 S1。spec-v0720 §7・brief L14）: URL に ?sfxlab がある時だけ Boot が Title の代わりにここへ来る（ふだんの URL は変わらない）。v0.7.1 の効果音の試聴の場は
// 下の段の「効果音の試聴へ」から。行 0 はタイトルの曲の候補 A・B・C と「止める」（S2 で任務の曲の行・S3 で命中スローの行を足す）。
// 押す: まだ作っていなければ作り始め（そのボタンの 2 行目に「作成中…」・右下に「作成中… B 40%」）、できたらそのタップの続きとして鳴らす（もう一度押さなくてよい）。
// 鳴っている（作っている）候補をもう一度押すと止める。別の候補は、その候補ができてから 0.5 秒で重ねる（それまで今の候補が鳴る）。候補と「止める」はボタンの音を鳴らさない（silent）。
// 再生はゲームと同じ口（systems/sfx-bus の sfxMusic(MUSIC_CTX_LAB)・sfxMusicAudition）＝ゲームと同じ大きさ・同じ標本（既定の曲はゲームの列と同じ buffer）。
// iOS: ボタンは指を離した時（MenuButton の onUp）に決まり、その touchend で Phaser と systems/sfx-boot が context を起こす。動き出す前に押した候補は覚えておき、動き出してから
// 曲の再生の 10 Hz の決めが鳴らす（止まっている context に積まない）。
// ゲームの保存（「音」「曲」）には触らない: 場にいる間だけ消音を解き曲をオンにし、出る時に保存の値へ戻す。出る時に候補の標本を捨てる（ゲームの列の曲は残す）。
// 静的な画面: 物体は create で 1 回だけ作る。update は曲の再生の状態を読み、変わった時だけ文を書き換える（毎フレームの setText をしない＝§7）。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, SCENE_KEYS } from '../config/game-config';
import {
  MUSIC_LAB_BUILDING_SUB_JA, MUSIC_LAB_HEAD_JA, MUSIC_LAB_LETTERS, MUSIC_LAB_NAMES_JA, MUSIC_LAB_NOTES_JA, MUSIC_LAB_ROW_LABELS_JA, MUSIC_LAB_ROW_SUBS_JA, MUSIC_LAB_STATUS_BUILDING_JA,
  MUSIC_LAB_STATUS_IDLE_JA, MUSIC_LAB_STATUS_NONE_JA, MUSIC_LAB_STATUS_PLAYING_JA, MUSIC_LAB_STATUS_STOPPED_JA, MUSIC_LAB_STATUS_WAIT_JA, MUSIC_LAB_STOP_JA, MUSIC_LAB_STOP_SUB_JA, MUSIC_LAB_TO_SFX_JA,
} from '../config/music-lab-config';
import { MUSIC_CTX_LAB, MUSIC_CTX_NONE, MUSIC_TITLE_KEYS, type MusicKey } from '../config/sfx-music-config';
import {
  SOUND_LAB_BACK_JA, SOUND_LAB_BACK_PX, SOUND_LAB_BUTTON_PX, SOUND_LAB_HEAD_PX, SOUND_LAB_HEAD_Y, SOUND_LAB_LABEL_PX, SOUND_LAB_LABEL_SUB_PX, SOUND_LAB_NOTE_PX, SOUND_LAB_STATUS_PX,
} from '../config/sound-lab-config';
import { HUD_COLOR, HUD_COLOR_STRONG, hudTextStyle } from '../config/ui-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../assets/sfx-music-themes';
import { sfxCanPlay, sfxMusic, sfxMusicAudition, sfxMusicEnabled, sfxMusicLabBuilding, sfxMusicLabPlaying, sfxMusicLabProgress, sfxSetMuted } from '../systems/sfx-bus';
import { musicEnabled, soundEnabled } from '../systems/sfx-settings';
import { MenuButton, addBuildLabel, menuWrapStyle } from '../ui/menu-ui';
import { MUSIC_LAB_ROW0_COLS, musicLabButtonSub, musicLabButtonTitle, musicLabSideRect } from '../ui/music-lab-layout';
import { soundLabBackRect, soundLabButtonRect, soundLabLabelRect, type SoundLabFrame } from '../ui/sound-lab-layout';

const NONE = -1;
/** 前に書いた状態の「まだ書いていない」 */
const UNSHOWN = -2;
const PERCENT = 100;
/** 鳴らせるか（sfxCanPlay の 3 つ: エンジンなし・止まっている・鳴らせる）を数に */
const CAN_NONE = 0, CAN_WAIT = 1, CAN_PLAY = 2;

export class MusicLabScene extends Phaser.Scene {
  private buttons: MenuButton[] = [];
  /** 候補のボタン（MUSIC_TITLE_KEYS の順） */
  private cands: MenuButton[] = [];
  private status?: Phaser.GameObjects.Text;
  /** 押した候補（MUSIC_TITLE_KEYS の番号。止めたら −1）と、一度でも押したか */
  private chosen = NONE;
  private tapped = false;
  /** 前に書いた状態（変わった時だけ文を書く）: 鳴らしている候補・作っている候補・進みの %・押した候補・鳴らせるか */
  private readonly shown = new Int16Array(5);
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.musicLab);
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.leaving = false;
    this.chosen = NONE;
    this.tapped = false;
    this.shown.fill(UNSHOWN);
    this.buttons = [];
    this.cands = [];
    const frame: SoundLabFrame = { gameWidth: GAME_WIDTH, gameHeight: GAME_HEIGHT, margin: HUD_MARGIN };
    addBuildLabel(this);
    this.add.text(GAME_WIDTH / 2, SOUND_LAB_HEAD_Y, MUSIC_LAB_HEAD_JA, menuWrapStyle(SOUND_LAB_HEAD_PX, HUD_COLOR_STRONG, GAME_WIDTH - 2 * HUD_MARGIN)).setOrigin(0.5, 0).setAlign('center').setDepth(DEPTH.hud);
    const l = soundLabLabelRect(0, frame);
    this.add.text(l.x, l.y + l.h / 2, MUSIC_LAB_ROW_LABELS_JA[0]!, hudTextStyle(SOUND_LAB_LABEL_PX, HUD_COLOR_STRONG)).setOrigin(0, 1).setDepth(DEPTH.hud);
    this.add.text(l.x, l.y + l.h / 2, MUSIC_LAB_ROW_SUBS_JA[0]!, hudTextStyle(SOUND_LAB_LABEL_SUB_PX, HUD_COLOR)).setOrigin(0, 0).setDepth(DEPTH.hud);
    for (let i = 0; i < MUSIC_TITLE_KEYS.length; i++) {
      const title = musicLabButtonTitle(MUSIC_LAB_LETTERS[i]!, MUSIC_LAB_NAMES_JA[i]!, MUSIC_TITLE_KEYS[i] === MUSIC_TITLE_DEFAULT_ID);
      const spec = { ...soundLabButtonRect(0, i, MUSIC_LAB_ROW0_COLS, frame), title, titlePx: SOUND_LAB_BUTTON_PX, sub: this.candSub(i), subPx: SOUND_LAB_NOTE_PX, align: 'center' as const, silent: true };
      const b = new MenuButton(this, spec, () => this.tap(i));
      this.cands.push(b);
      this.buttons.push(b);
    }
    const stopRect = soundLabButtonRect(0, MUSIC_TITLE_KEYS.length, MUSIC_LAB_ROW0_COLS, frame);
    const stop = { ...stopRect, title: MUSIC_LAB_STOP_JA, titlePx: SOUND_LAB_BUTTON_PX, sub: MUSIC_LAB_STOP_SUB_JA, subPx: SOUND_LAB_NOTE_PX, align: 'center' as const, silent: true };
    this.buttons.push(new MenuButton(this, stop, () => this.tap(NONE)));
    const back = soundLabBackRect(frame);
    this.buttons.push(new MenuButton(this, { ...back, title: SOUND_LAB_BACK_JA, titlePx: SOUND_LAB_BACK_PX, align: 'center' }, () => this.leave(SCENE_KEYS.title)));
    this.buttons.push(new MenuButton(this, { ...musicLabSideRect(frame), title: MUSIC_LAB_TO_SFX_JA, titlePx: SOUND_LAB_BACK_PX, align: 'center' }, () => this.leave(SCENE_KEYS.soundLab)));
    this.status = this.add.text(GAME_WIDTH - HUD_MARGIN, back.y + back.h / 2, '', hudTextStyle(SOUND_LAB_STATUS_PX, HUD_COLOR)).setOrigin(1, 0.5).setDepth(DEPTH.hud);
    // 場にいる間だけ鳴らす（保存の値は変えない）。曲の場面は試聴（ゲームの列の曲が鳴っていれば消える）
    sfxSetMuted(false);
    sfxMusicEnabled(true);
    sfxMusic(MUSIC_CTX_LAB);
    this.update();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const b of this.buttons) b.destroy();
      this.buttons = [];
      this.cands = [];
      this.status = undefined;
      sfxMusic(MUSIC_CTX_NONE); // 候補の標本を捨てる（ゲームの列の曲は残す）。行き先の Title はメニューの曲を頼む
      sfxSetMuted(!soundEnabled());
      sfxMusicEnabled(musicEnabled());
    });
  }

  /** 曲の再生の状態を読み、変わった時だけ文を書き換える（確保しない。書き換える時だけ refresh が文を作る） */
  override update(): void {
    const p = this.candOf(sfxMusicLabPlaying());
    const b = this.candOf(sfxMusicLabBuilding());
    const pct = b === NONE ? 0 : Math.floor(sfxMusicLabProgress() * PERCENT);
    const c = sfxCanPlay();
    const can = c === null ? CAN_NONE : c ? CAN_PLAY : CAN_WAIT;
    const s = this.shown;
    if (s[0] === p && s[1] === b && s[2] === pct && s[3] === this.chosen && s[4] === can) return;
    s[0] = p;
    s[1] = b;
    s[2] = pct;
    s[3] = this.chosen;
    s[4] = can;
    this.refresh(p, b, pct, can);
  }

  /** 候補 i を押した（−1 は「止める」）: 押してある候補（鳴っている・作っている）をもう一度押すと止める。ほかは鳴らす（まだなら作ってから） */
  private tap(i: number): void {
    this.tapped = true;
    this.chosen = i === this.chosen ? NONE : i;
    sfxMusicAudition(this.chosen === NONE ? null : MUSIC_TITLE_KEYS[this.chosen]!);
    this.update();
  }

  /** 文を書き換える（状態が変わった時だけ）: 押した候補を作っている間はそのボタンの 2 行目に「作成中…」、鳴っている候補は枠を強く、右下に状態の一文 */
  private refresh(p: number, b: number, pct: number, can: number): void {
    for (let i = 0; i < this.cands.length; i++) {
      this.cands[i]!.setSub(i === this.chosen && i === b ? MUSIC_LAB_BUILDING_SUB_JA : this.candSub(i));
      this.cands[i]!.setSelected(i === p);
    }
    const st = this.status;
    if (!st) return;
    let text: string;
    if (can === CAN_NONE) text = MUSIC_LAB_STATUS_NONE_JA;
    else if (this.chosen !== NONE && this.chosen === b) text = `${MUSIC_LAB_STATUS_BUILDING_JA}${MUSIC_LAB_LETTERS[b]!} ${pct}%`;
    else if (this.chosen !== NONE && can === CAN_WAIT) text = MUSIC_LAB_STATUS_WAIT_JA;
    else if (p !== NONE) text = `${MUSIC_LAB_STATUS_PLAYING_JA}${MUSIC_LAB_LETTERS[p]!}`;
    else text = this.tapped && this.chosen === NONE ? MUSIC_LAB_STATUS_STOPPED_JA : MUSIC_LAB_STATUS_IDLE_JA;
    if (st.text !== text) st.setText(text);
  }

  /** 候補 i のボタンの 2 行目（ゲームの曲は名前・ほかは一言） */
  private candSub(i: number): string {
    return musicLabButtonSub(MUSIC_LAB_NAMES_JA[i]!, MUSIC_LAB_NOTES_JA[i]!, MUSIC_TITLE_KEYS[i] === MUSIC_TITLE_DEFAULT_ID);
  }

  /** 曲の鍵 → 候補の番号（タイトルの曲でなければ −1） */
  private candOf(k: MusicKey | null): number {
    return k === null ? NONE : MUSIC_TITLE_KEYS.indexOf(k);
  }

  /** 「戻る」（Title）・「効果音の試聴へ」: 二重押しは leaving で防ぐ（標本と保存の値は SHUTDOWN で戻す） */
  private leave(to: string): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(to);
  }
}
