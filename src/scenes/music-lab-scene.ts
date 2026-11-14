// 曲の試聴の場（v0.7.2 S1。spec-v0720 §7・brief L14）: URL に ?sfxlab がある時だけ Boot が Title の代わりにここへ来る（ふだんの URL は変わらない）。v0.7.1 の効果音の試聴の場は
// 下の段の「効果音の試聴へ」から。行 0 はタイトルの曲の候補 A・D・E（v0.7.2 IP1 で B・C から替えた）と「止める」。S2（brief L25）: 行 1「任務の曲」＝段（静か・緊張・戦闘）・自動（8 秒ずつ回す）・止める、
// 行 2「効果音と一緒に」＝台本 3 つ（systems/sfx-lab-demo。聞き手 (0, 0)・本物の距離の帯・合図・ループ＝ゲームと同じ大きさと下げ）・止める。
// S3（brief L31）: 行 2 の 4 つ目「命中＋スロー」（台本）と行 3「命中スロー」＝案 A・B・C（押すたびにその案にして、今のベッド＝行 2 の台本〔鳴っていなければ「静か＋海」から〕に魚雷の命中と
// data の秒の命中スロー＝ゲームと同じ道。選んだ案のボタンを強く。場を出る時に既定の案へ戻す）。ボタンの題と 2 行目は ui/music-lab-layout（250 行に収めるため移した）。
// 押す: まだ作っていなければ作り始め（そのボタンの 2 行目に「作成中…」・右下に「作成中… D 40%」）、できたらそのタップの続きとして鳴らす（もう一度押さなくてよい）。
// 鳴っている（作っている）ボタンをもう一度押すと止める。別の曲は、その曲ができてから 0.5 秒で重ねる（それまで今の曲が鳴る）。任務の曲の段は同じ家族のまま段だけ移る（ゲームの時定数）。
// 行 2 の台本は任務の曲が鳴ってから始める。どのボタンもボタンの音を鳴らさない（silent。戻る・効果音の試聴へは鳴らす）。
// 再生はゲームと同じ口（systems/sfx-bus の sfxMusic(MUSIC_CTX_LAB)・sfxMusicAudition・sfxMusicMood）＝ゲームと同じ大きさ・同じ標本（ゲームの列の曲は同じ buffer）。
// iOS: ボタンは指を離した時（MenuButton の onUp）に決まり、その touchend で Phaser と systems/sfx-boot が context を起こす。動き出す前に押した曲は覚えておき、動き出してから
// 曲の再生の 10 Hz の決めが鳴らす（止まっている context に積まない）。
// ゲームの保存（「音」「曲」）には触らない: 場にいる間だけ消音を解き曲をオンにし、出る時に保存の値へ戻す。出る時に候補の標本を捨てる（ゲームの列の曲は残す）。
// 静的な画面: 物体は create で 1 回だけ作る。update は曲の再生の状態を読み、変わった時だけ文を書き換える（毎フレームの setText をしない＝§7）。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, REGISTRY_KEY_DATA, RENDER_SCALE, SCENE_KEYS } from '../config/game-config';
import { getGameData } from '../config/game-data';
import {
  MUSIC_LAB_AUTO_JA, MUSIC_LAB_AUTO_MOODS, MUSIC_LAB_AUTO_STEP_S, MUSIC_LAB_BUILDING_SUB_JA, MUSIC_LAB_DEMO_TITLES_JA, MUSIC_LAB_DEMOS, MUSIC_LAB_FAMILY_JA, MUSIC_LAB_HEAD_JA, MUSIC_LAB_LETTERS,
  MUSIC_LAB_MOOD_TITLES_JA, MUSIC_LAB_ROW_LABELS_JA, MUSIC_LAB_ROW_SUBS_JA, MUSIC_LAB_STATUS_BUILDING_JA, MUSIC_LAB_STATUS_IDLE_JA, MUSIC_LAB_STATUS_NONE_JA,
  MUSIC_LAB_STATUS_PLAYING_JA, MUSIC_LAB_STATUS_STOPPED_JA, MUSIC_LAB_STATUS_WAIT_JA, MUSIC_LAB_TO_SFX_JA,
} from '../config/music-lab-config';
import { MUSIC_CTX_LAB, MUSIC_CTX_NONE, MUSIC_LAYER_KEYS, MUSIC_TITLE_KEYS, SFX_SLOW_DEFAULT_ID, SFX_SLOW_IDS, type MusicKey } from '../config/sfx-music-config';
import {
  SOUND_LAB_BACK_JA, SOUND_LAB_BACK_PX, SOUND_LAB_BUTTON_PX, SOUND_LAB_HEAD_PX, SOUND_LAB_HEAD_Y, SOUND_LAB_LABEL_PX, SOUND_LAB_LABEL_SUB_PX, SOUND_LAB_NOTE_PX, SOUND_LAB_STATUS_PX,
} from '../config/sound-lab-config';
import { HUD_COLOR, HUD_COLOR_STRONG, hudTextStyle } from '../config/ui-config';
import { MUSIC_TITLE_DEFAULT_ID } from '../assets/sfx-music-themes';
import { SfxLabDemo } from '../systems/sfx-lab-demo';
import { sfxCanPlay, sfxMusic, sfxMusicAudition, sfxMusicEnabled, sfxMusicLabBuilding, sfxMusicLabPlaying, sfxMusicLabProgress, sfxMusicMood, sfxSetMuted, sfxSlowVariant } from '../systems/sfx-bus';
import { musicEnabled, soundEnabled } from '../systems/sfx-settings';
import { MenuButton, addBuildLabel, menuWrapStyle } from '../ui/menu-ui';
import { MUSIC_LAB_ROW_COLS, MUSIC_LAB_ROW_DEMO, MUSIC_LAB_ROW_MOOD, MUSIC_LAB_ROW_SLOW, MUSIC_LAB_ROW_TITLE, musicLabHasStop, musicLabLabel, musicLabSideRect } from '../ui/music-lab-layout';
import { soundLabBackRect, soundLabButtonRect, soundLabLabelRect, type SoundLabFrame } from '../ui/sound-lab-layout';

const NONE = -1;
/** 前に書いた状態の「まだ書いていない」 */
const UNSHOWN = -2;
const PERCENT = 100;
const MS_PER_S = 1000;
/** 鳴らせるか（sfxCanPlay の 3 つ: エンジンなし・止まっている・鳴らせる）を数に */
const CAN_NONE = 0, CAN_WAIT = 1, CAN_PLAY = 2;
/** 行（ui/music-lab-layout）と、行ごとの列の数・選んだボタンの番号（行 × ROW_SPAN ＋ 列）。行 1 の「自動」の列。ゲームの曲・ゲームの命中スローの案の番号（「記号（今）」） */
const ROW_TITLE = MUSIC_LAB_ROW_TITLE, ROW_MOOD = MUSIC_LAB_ROW_MOOD, ROW_DEMO = MUSIC_LAB_ROW_DEMO, ROW_SLOW = MUSIC_LAB_ROW_SLOW, ROW_COLS = MUSIC_LAB_ROW_COLS;
const ROW_SPAN = 8;
const TITLE_DEFAULT = MUSIC_TITLE_KEYS.indexOf(MUSIC_TITLE_DEFAULT_ID);
const SLOW_DEFAULT = SFX_SLOW_IDS.indexOf(SFX_SLOW_DEFAULT_ID);
const COL_AUTO = MUSIC_LAB_MOOD_TITLES_JA.length;
/** 曲の印: タイトルの候補は MUSIC_TITLE_KEYS の番号・任務の家族は FAMILY（作っている層は FAMILY ＋ 層） */
const FAMILY = 10;
const FAMILY_KEY: MusicKey = MUSIC_LAYER_KEYS[0]!;

export class MusicLabScene extends Phaser.Scene {
  private buttons: MenuButton[] = [];
  /** 行ごとのボタン（列の順。最後は「止める」）と、その 2 行目（create で 1 回作る＝refresh は引くだけ） */
  private rows: MenuButton[][] = [];
  private subs: string[][] = [];
  private status?: Phaser.GameObjects.Text;
  private readonly demo = new SfxLabDemo();
  /** 選んだボタン（行 × ROW_SPAN ＋ 列。止めたら −1）・一度でも押したか・「自動」の段の番号と秒 */
  private chosen = NONE;
  private tapped = false;
  private autoI = 0;
  private autoS = 0;
  /** S3: 命中スローの案（SFX_SLOW_IDS の番号。選んだ案のボタンを強く） */
  private slowI = SLOW_DEFAULT;
  /** 前に書いた状態（変わった時だけ文を書く）: 鳴らしている曲・作っている曲・進みの %・選んだボタン・鳴らせるか・自動の段・命中スローの案 */
  private readonly shown = new Int16Array(7);
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.musicLab);
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.leaving = false;
    this.chosen = NONE;
    this.tapped = false;
    this.slowI = SLOW_DEFAULT;
    this.demo.slowS = getGameData(this.registry, REGISTRY_KEY_DATA).hitRateModel.feel.hit_slowmo_seconds; // 命中スローの秒（世界と同じ data）
    this.shown.fill(UNSHOWN);
    this.buttons = [];
    this.rows = [];
    this.subs = [];
    const frame: SoundLabFrame = { gameWidth: GAME_WIDTH, gameHeight: GAME_HEIGHT, margin: HUD_MARGIN };
    addBuildLabel(this);
    this.add.text(GAME_WIDTH / 2, SOUND_LAB_HEAD_Y, MUSIC_LAB_HEAD_JA, menuWrapStyle(SOUND_LAB_HEAD_PX, HUD_COLOR_STRONG, GAME_WIDTH - 2 * HUD_MARGIN)).setOrigin(0.5, 0).setAlign('center').setDepth(DEPTH.hud);
    for (let row = 0; row < ROW_COLS.length; row++) {
      const l = soundLabLabelRect(row, frame);
      this.add.text(l.x, l.y + l.h / 2, MUSIC_LAB_ROW_LABELS_JA[row]!, hudTextStyle(SOUND_LAB_LABEL_PX, HUD_COLOR_STRONG)).setOrigin(0, 1).setDepth(DEPTH.hud);
      this.add.text(l.x, l.y + l.h / 2, MUSIC_LAB_ROW_SUBS_JA[row]!, hudTextStyle(SOUND_LAB_LABEL_SUB_PX, HUD_COLOR)).setOrigin(0, 0).setDepth(DEPTH.hud);
      const list: MenuButton[] = [];
      const subs: string[] = [];
      for (let col = 0; col < ROW_COLS[row]!; col++) {
        const [title, sub] = musicLabLabel(row, col, TITLE_DEFAULT, SLOW_DEFAULT);
        subs.push(sub);
        const spec = { ...soundLabButtonRect(row, col, ROW_COLS[row]!, frame), title, titlePx: SOUND_LAB_BUTTON_PX, sub, subPx: SOUND_LAB_NOTE_PX, align: 'center' as const, silent: true };
        const code = row * ROW_SPAN + col;
        const b = new MenuButton(this, spec, () => this.tap(code));
        list.push(b);
        this.buttons.push(b);
      }
      this.rows.push(list);
      this.subs.push(subs);
    }
    const back = soundLabBackRect(frame);
    this.buttons.push(new MenuButton(this, { ...back, title: SOUND_LAB_BACK_JA, titlePx: SOUND_LAB_BACK_PX, align: 'center' }, () => this.leave(SCENE_KEYS.title)));
    this.buttons.push(new MenuButton(this, { ...musicLabSideRect(frame), title: MUSIC_LAB_TO_SFX_JA, titlePx: SOUND_LAB_BACK_PX, align: 'center' }, () => this.leave(SCENE_KEYS.soundLab)));
    this.status = this.add.text(GAME_WIDTH - HUD_MARGIN, back.y + back.h / 2, '', hudTextStyle(SOUND_LAB_STATUS_PX, HUD_COLOR)).setOrigin(1, 0.5).setDepth(DEPTH.hud);
    // 場にいる間だけ鳴らす（保存の値は変えない）。曲の場面は試聴（ゲームの列の曲が鳴っていれば消える）
    sfxSetMuted(false);
    sfxMusicEnabled(true);
    sfxMusic(MUSIC_CTX_LAB);
    this.update(0, 0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const b of this.buttons) b.destroy();
      this.buttons = [];
      this.rows = [];
      this.subs = [];
      this.status = undefined;
      this.demo.stop(); // 台本のループを止めて聞き手を外す（命中スローの音も戻る）
      sfxSlowVariant(SFX_SLOW_DEFAULT_ID); // 命中スローはゲームの案へ
      sfxMusic(MUSIC_CTX_NONE); // 候補の標本を捨てる（ゲームの列の曲は残す）。行き先の Title はメニューの曲を頼む
      sfxSetMuted(!soundEnabled());
      sfxMusicEnabled(musicEnabled());
    });
  }

  /** 曲の再生の状態を読み、変わった時だけ文を書き換える（確保しない）。自動の段を回し、任務の曲が鳴ってから台本を始めて進める */
  override update(_time: number, deltaMs: number): void {
    const dtS = deltaMs / MS_PER_S;
    const p = this.markOf(sfxMusicLabPlaying());
    const b = this.markOf(sfxMusicLabBuilding());
    const row = this.chosen === NONE ? NONE : Math.floor(this.chosen / ROW_SPAN);
    const col = this.chosen - row * ROW_SPAN;
    if (row === ROW_MOOD && col === COL_AUTO && p === FAMILY) {
      this.autoS += dtS;
      if (this.autoS >= MUSIC_LAB_AUTO_STEP_S) {
        this.autoS -= MUSIC_LAB_AUTO_STEP_S;
        this.autoI = this.autoI + 1 < MUSIC_LAB_AUTO_MOODS.length ? this.autoI + 1 : 0;
        sfxMusicMood(MUSIC_LAB_AUTO_MOODS[this.autoI]!);
      }
    }
    if (row === ROW_DEMO && p === FAMILY && this.demo.active !== col) this.demo.start(col);
    this.demo.update(dtS);
    const pct = b === NONE ? 0 : Math.floor(sfxMusicLabProgress() * PERCENT);
    const c = sfxCanPlay();
    const can = c === null ? CAN_NONE : c ? CAN_PLAY : CAN_WAIT;
    const s = this.shown;
    if (s[0] === p && s[1] === b && s[2] === pct && s[3] === this.chosen && s[4] === can && s[5] === this.autoI && s[6] === this.slowI) return;
    s[0] = p;
    s[1] = b;
    s[2] = pct;
    s[3] = this.chosen;
    s[4] = can;
    s[5] = this.autoI;
    s[6] = this.slowI;
    this.refresh(p, b, pct, can);
  }

  /** ボタンを押した（行 × ROW_SPAN ＋ 列）: 「止める」と、選んであるボタン（鳴っている・作っている）をもう一度押すと止める。ほかは鳴らす（まだなら作ってから）。行 3 は案を替えて命中とスロー */
  private tap(code: number): void {
    this.tapped = true;
    let row = Math.floor(code / ROW_SPAN);
    let col = code - row * ROW_SPAN;
    if (row === ROW_SLOW) {
      this.slowI = col;
      sfxSlowVariant(SFX_SLOW_IDS[col]!);
      this.demo.queueHit(); // 台本が鳴っていれば今、まだなら始まった時に（台本でなければ「静か＋海」から）
      if (Math.floor(this.chosen / ROW_SPAN) === ROW_DEMO) {
        this.update(0, 0);
        return;
      }
      row = ROW_DEMO;
      col = 0;
      code = ROW_DEMO * ROW_SPAN;
    }
    const stop = (musicLabHasStop(row) && col === ROW_COLS[row]! - 1) || code === this.chosen;
    this.chosen = stop ? NONE : code;
    if (stop || row !== ROW_DEMO) this.demo.stop(); // 別の台本へは update が頭から替える（ループは続ける）
    if (stop) {
      sfxMusicAudition(null);
    } else if (row === ROW_TITLE) {
      sfxMusicAudition(MUSIC_TITLE_KEYS[col]!);
    } else {
      // 任務の曲: 段を先に渡してから家族を頼む（まだ鳴っていなければ、その段の音量から上げる）
      this.autoI = 0;
      this.autoS = 0;
      sfxMusicMood(row === ROW_DEMO ? MUSIC_LAB_DEMOS[col]!.mood : col === COL_AUTO ? MUSIC_LAB_AUTO_MOODS[0]! : col);
      sfxMusicAudition(FAMILY_KEY);
    }
    this.update(0, 0);
  }

  /** 文を書き換える（状態が変わった時だけ）: 選んだボタンの曲を作っている間はその 2 行目に「作成中…」、鳴っているボタンは枠を強く、右下に状態の一文 */
  private refresh(p: number, b: number, pct: number, can: number): void {
    const building = this.chosen !== NONE && b !== NONE && (b === this.chosen || (b >= FAMILY && this.chosen >= ROW_MOOD * ROW_SPAN));
    for (let row = 0; row < this.rows.length; row++) {
      for (let col = 0; col < this.rows[row]!.length; col++) {
        const code = row * ROW_SPAN + col;
        const on = row === ROW_TITLE ? col === p : row === ROW_SLOW ? col === this.slowI : p === FAMILY && code === this.chosen;
        this.rows[row]![col]!.setSub(building && code === this.chosen ? MUSIC_LAB_BUILDING_SUB_JA : this.subs[row]![col]!);
        this.rows[row]![col]!.setSelected(on);
      }
    }
    const st = this.status;
    if (!st) return;
    let text: string;
    if (can === CAN_NONE) text = MUSIC_LAB_STATUS_NONE_JA;
    else if (building) text = `${MUSIC_LAB_STATUS_BUILDING_JA}${this.nameOf(b)} ${pct}%`;
    else if (this.chosen !== NONE && can === CAN_WAIT) text = MUSIC_LAB_STATUS_WAIT_JA;
    else if (p !== NONE) text = `${MUSIC_LAB_STATUS_PLAYING_JA}${this.playingName(p)}`;
    else text = this.tapped && this.chosen === NONE ? MUSIC_LAB_STATUS_STOPPED_JA : MUSIC_LAB_STATUS_IDLE_JA;
    if (st.text !== text) st.setText(text);
  }

  /** 曲の印 → 状態の一文の名前（タイトルの候補は記号・任務の家族は「任務の曲 1/3」の層） */
  private nameOf(mark: number): string {
    return mark >= FAMILY ? `${MUSIC_LAB_FAMILY_JA} ${mark - FAMILY + 1}/${MUSIC_LAYER_KEYS.length}` : MUSIC_LAB_LETTERS[mark]!;
  }

  /** 鳴らしている曲の名前（任務の家族は選んだボタンの題。自動は今の段を添える） */
  private playingName(p: number): string {
    if (p < FAMILY) return MUSIC_LAB_LETTERS[p]!;
    const row = Math.floor(this.chosen / ROW_SPAN);
    const col = this.chosen - row * ROW_SPAN;
    if (row === ROW_DEMO) return MUSIC_LAB_DEMO_TITLES_JA[col]!;
    const mood = row === ROW_MOOD ? (col === COL_AUTO ? MUSIC_LAB_AUTO_MOODS[this.autoI]! : col) : NONE;
    return mood === NONE ? MUSIC_LAB_FAMILY_JA : `${MUSIC_LAB_FAMILY_JA} ${col === COL_AUTO ? `${MUSIC_LAB_AUTO_JA}・` : ''}${MUSIC_LAB_MOOD_TITLES_JA[mood]!}`;
  }

  /** 曲の鍵 → 印（タイトルの候補は番号・任務の家族の層は FAMILY ＋ 層・無ければ −1） */
  private markOf(k: MusicKey | null): number {
    if (k === null) return NONE;
    const t = MUSIC_TITLE_KEYS.indexOf(k);
    return t >= 0 ? t : FAMILY + MUSIC_LAYER_KEYS.indexOf(k);
  }

  /** 「戻る」（Title）・「効果音の試聴へ」: 二重押しは leaving で防ぐ（標本と保存の値は SHUTDOWN で戻す） */
  private leave(to: string): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(to);
  }
}
