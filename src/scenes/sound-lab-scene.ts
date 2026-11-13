// 音の試聴の場（v0.7.1 IP2。実機 2 回目「弾倉交換はやはりまぬけ…」「魚雷発射音も…ポンっ」）: URL に ?sfxlab がある時だけ Boot が Title の代わりにここへ来る（ふだんの URL は変わらない）。
// 弾倉の始め・弾倉の終わり・魚雷の発射の案 A〜D（assets/sfx-variants。D は IP1 の音）と「続けて聞く」（始め → 1.2 秒 → 終わり）をボタンで鳴らす。IP3（実機 3 回目）で
// 魚雷の発射の新しい案 E〜I の行を足した（行と案の対応は SFX_LAB_ROWS）。ゲームの再生のエンジンを
// そのまま使い、鍵の標本を押した案に差し替えて合図と同じ音量（鍵の表の音量 × 1）で鳴らす＝ゲームの中と同じ大きさ。場を出る時（SHUTDOWN）に既定の標本へ戻す。
// 静的な画面: 物体は create で 1 回だけ作る。案の標本は押した時に 1 回だけ作って覚える（1 本 1〜20 ms）。update は最初のタップの待ちを見るだけ（確保しない）。
// iOS: ボタンは指を離した時（MenuButton の onUp）に決まり、その touchend で Phaser と systems/sfx-boot が context を起こす。まだ動いていなければ押した案を 1 つ覚え、
// SFX_LAB.pendingS 秒の内に動き出したら鳴らす（止まっている context に積まない）。案のボタンはボタンの音を鳴らさない（聞き比べる音の頭に重ねない）。
// ゲームの遊び・保存（消音の設定）には触らない: 場にいる間だけ消音を解き、出る時に保存の値へ戻す。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, SCENE_KEYS } from '../config/game-config';
import { SFX_LAB } from '../config/sfx-config';
import {
  SOUND_LAB_BACK_JA, SOUND_LAB_BACK_PX, SOUND_LAB_BUTTON_PX, SOUND_LAB_HEAD_JA, SOUND_LAB_HEAD_PX, SOUND_LAB_HEAD_Y, SOUND_LAB_LABEL_PX, SOUND_LAB_LABEL_SUB_PX, SOUND_LAB_NOTE_PX,
  SOUND_LAB_PAIR_NOTE_JA, SOUND_LAB_PLAYED_JA, SOUND_LAB_ROW_LABELS_JA, SOUND_LAB_ROW_SUBS_JA, SOUND_LAB_STATUS_IDLE_JA, SOUND_LAB_STATUS_NONE_JA, SOUND_LAB_STATUS_PX, SOUND_LAB_STATUS_WAIT_JA,
} from '../config/sound-lab-config';
import { HUD_COLOR, HUD_COLOR_STRONG, hudTextStyle } from '../config/ui-config';
import { renderSfx } from '../assets/sfx-bank';
import { SFX_LAB_ROWS, SFX_VARIANT_GROUPS, renderSfxVariant } from '../assets/sfx-variants';
import { sfxCanPlay, sfxCue, sfxSetBuffer, sfxSetMuted } from '../systems/sfx-bus';
import { soundEnabled } from '../systems/sfx-settings';
import { MenuButton, addBuildLabel, menuWrapStyle } from '../ui/menu-ui';
import { soundLabBackRect, soundLabButtonRect, soundLabButtonTitle, soundLabLabelRect, type SoundLabFrame } from '../ui/sound-lab-layout';

/** 「続けて聞く」の行（SFX_LAB_ROWS の後）。始めと終わりの組（SFX_VARIANT_GROUPS の添字） */
const PAIR_ROW = SFX_LAB_ROWS.length;
const PAIR_START = 0;
const PAIR_END = 1;
const NONE = -1;
const MS_PER_S = 1000;

export class SoundLabScene extends Phaser.Scene {
  private buttons: MenuButton[] = [];
  /** 案の標本（[行][列]。押した時に作って覚える） */
  private samples: (Float32Array | null)[][] = [];
  private status?: Phaser.GameObjects.Text;
  private pendingRow = NONE;
  private pendingCol = NONE;
  private pendingAtMs = 0;
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.soundLab);
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.leaving = false;
    this.pendingRow = NONE;
    this.buttons = [];
    this.samples = SFX_VARIANT_GROUPS.map((g) => g.variants.map(() => null));
    const frame: SoundLabFrame = { gameWidth: GAME_WIDTH, gameHeight: GAME_HEIGHT, margin: HUD_MARGIN };
    addBuildLabel(this);
    this.add.text(GAME_WIDTH / 2, SOUND_LAB_HEAD_Y, SOUND_LAB_HEAD_JA, menuWrapStyle(SOUND_LAB_HEAD_PX, HUD_COLOR_STRONG, GAME_WIDTH - 2 * HUD_MARGIN)).setOrigin(0.5, 0).setAlign('center').setDepth(DEPTH.hud);
    for (let row = 0; row <= PAIR_ROW; row++) {
      const r = soundLabLabelRect(row, frame);
      this.add.text(r.x, r.y + r.h / 2, SOUND_LAB_ROW_LABELS_JA[row]!, hudTextStyle(SOUND_LAB_LABEL_PX, HUD_COLOR_STRONG)).setOrigin(0, 1).setDepth(DEPTH.hud);
      this.add.text(r.x, r.y + r.h / 2, SOUND_LAB_ROW_SUBS_JA[row]!, hudTextStyle(SOUND_LAB_LABEL_SUB_PX, HUD_COLOR)).setOrigin(0, 0).setDepth(DEPTH.hud);
      const lr = row < PAIR_ROW ? SFX_LAB_ROWS[row]! : { group: PAIR_START, first: 0, count: SFX_VARIANT_GROUPS[PAIR_START]!.variants.length };
      const g = SFX_VARIANT_GROUPS[lr.group]!;
      for (let col = 0; col < lr.count; col++) {
        const vi = lr.first + col;
        const v = g.variants[vi]!;
        const b = soundLabButtonRect(row, col, lr.count, frame);
        const sub = row < PAIR_ROW ? g.notesJa[vi]! : SOUND_LAB_PAIR_NOTE_JA;
        const title = soundLabButtonTitle(v.id, v.id === g.defaultId, row < PAIR_ROW ? g.kindsJa?.[vi] : '');
        const spec = { ...b, title, titlePx: SOUND_LAB_BUTTON_PX, sub, subPx: SOUND_LAB_NOTE_PX, align: 'center' as const, silent: true };
        this.buttons.push(new MenuButton(this, spec, () => this.tap(row, col)));
      }
    }
    const back = soundLabBackRect(frame);
    this.buttons.push(new MenuButton(this, { ...back, title: SOUND_LAB_BACK_JA, titlePx: SOUND_LAB_BACK_PX, align: 'center' }, () => this.leave()));
    const statusText = sfxCanPlay() === null ? SOUND_LAB_STATUS_NONE_JA : SOUND_LAB_STATUS_IDLE_JA;
    this.status = this.add.text(GAME_WIDTH - HUD_MARGIN, back.y + back.h / 2, statusText, hudTextStyle(SOUND_LAB_STATUS_PX, HUD_COLOR)).setOrigin(1, 0.5).setDepth(DEPTH.hud);
    sfxSetMuted(false); // 場にいる間だけ鳴らす（保存の値は変えない）

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const b of this.buttons) b.destroy();
      this.buttons = [];
      this.samples = [];
      this.status = undefined;
      for (const g of SFX_VARIANT_GROUPS) sfxSetBuffer(g.key, renderSfx(g.key)); // 既定の標本へ戻す
      sfxSetMuted(!soundEnabled());
    });
  }

  /** 最初のタップの待ち: 覚えた案を、context が動き出したら鳴らす（古くなれば捨てる）。確保しない */
  override update(time: number): void {
    if (this.pendingRow === NONE) return;
    if (time - this.pendingAtMs > SFX_LAB.pendingS * MS_PER_S) {
      this.pendingRow = NONE;
      return;
    }
    if (sfxCanPlay() !== true) return;
    const row = this.pendingRow;
    this.pendingRow = NONE;
    this.audition(row, this.pendingCol);
  }

  /** ボタンを押した: 鳴らせればすぐ、まだ context が動いていなければ覚えて待つ */
  private tap(row: number, col: number): void {
    const can = sfxCanPlay();
    if (can === true) {
      this.audition(row, col);
      return;
    }
    this.pendingRow = can === null ? NONE : row;
    this.pendingCol = col;
    this.pendingAtMs = this.time.now;
    this.status?.setText(can === null ? SOUND_LAB_STATUS_NONE_JA : SOUND_LAB_STATUS_WAIT_JA);
  }

  /** 行 row・列 col を鳴らす（「続けて聞く」は始めを今・終わりを SFX_LAB.pairGapS 秒後の予約で） */
  private audition(row: number, col: number): void {
    let id: string;
    if (row < PAIR_ROW) {
      const lr = SFX_LAB_ROWS[row]!;
      this.sound1(lr.group, lr.first + col, 0);
      id = SFX_VARIANT_GROUPS[lr.group]!.variants[lr.first + col]!.id;
    } else {
      this.sound1(PAIR_START, col, 0);
      this.sound1(PAIR_END, col, SFX_LAB.pairGapS);
      id = SFX_VARIANT_GROUPS[PAIR_START]!.variants[col]!.id;
    }
    this.status?.setText(`${SOUND_LAB_PLAYED_JA}${SOUND_LAB_ROW_LABELS_JA[row]!} ${id}`);
  }

  /** 1 つの案を鳴らす: 標本を作って（初回だけ）鍵に差し替え、合図と同じ音量で（delayS 秒後の予約） */
  private sound1(gi: number, vi: number, delayS: number): void {
    const g = SFX_VARIANT_GROUPS[gi]!;
    const v = g.variants[vi]!;
    let x = this.samples[gi]![vi];
    if (!x) {
      x = renderSfxVariant(v);
      this.samples[gi]![vi] = x;
    }
    sfxSetBuffer(g.key, x);
    sfxCue(g.key, 1, delayS, v.rate);
  }

  /** 「戻る」: タイトルへ（差し替えた標本は SHUTDOWN で既定に戻す。二重押しは leaving で防ぐ） */
  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(SCENE_KEYS.title);
  }
}
