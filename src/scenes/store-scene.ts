// ストア（v0.9.0 S1。spec-v0900 §4.6）: 財布・品の格子（題・効きの短い文・状態）・選んだ品の説明と効く任務・右下の主ボタン（交換する → 本当に交換 → 交換／外す ⇄ 装着する）・「← 任務一覧」。
// Title の左上の「ストア」から（13 任務の達成か ?debug&store=1）。曲は Title が頼んだメニューの曲のまま（音の層を import しない＝tests/sfx-rules の許可表の外）。静的な画面: 物体は create で 1 回だけ作り、update は持たない（§7）。品を選ぶと変わった物だけ setText・setSelected。
// v0.9.0 IP3: ご褒美「歴戦の乗員」の札（まだなら右に進み n/13・主ボタンは「ご褒美」で押せない。渡した後はほかの品と同じ 外す ⇄ 装着する）。
// 交換と装着の入り切りは保存（systems/store-storage。交換は点を引くのと持ち物に足すのを 1 回の setItem）してから作り直す（格子の状態・財布を組み直す＝Title のタブと同じ作法）。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, REGISTRY_KEY_DATA, RENDER_SCALE, SCENE_KEYS } from '../config/game-config';
import { getGameData } from '../config/game-data';
import { getStoreCatalogue } from '../config/store-data';
import {
  STORE_ACTION_PX,
  STORE_BACK_JA,
  STORE_BACK_PX,
  STORE_BUY_JA,
  STORE_CARD_COMPACT_PAD_Y,
  STORE_CARD_STATE_PX,
  STORE_CARD_SUB_PX,
  STORE_CARD_TITLE_PX,
  STORE_CONFIRM_JA,
  STORE_CONFIRM_MS,
  STORE_DESC_GAP,
  STORE_DESC_LINE_GAP,
  STORE_DESC_PX,
  STORE_DESC_WRAP,
  STORE_EQUIP_JA,
  STORE_HINT_JA,
  STORE_HINT_PX,
  STORE_LEAD_JA,
  STORE_LEAD_PX,
  STORE_LEAD_Y,
  STORE_MARGIN,
  STORE_SAVE_FAILED_JA,
  STORE_TITLE_JA,
  STORE_TITLE_PX,
  STORE_TITLE_X,
  STORE_TITLE_Y,
  STORE_UNEQUIP_JA,
  STORE_WALLET_PX,
  STORE_CARD_COMPACT_FROM,
  storeActionRect,
  storeBackRect,
  storeCardRect,
  storeGridBottom,
  storeGridLeft,
  storeWalletAnchor,
} from '../config/store-layout-config';
import { HOME_COLOR_TEXT, HUD_COLOR, HUD_COLOR_STRONG, HUD_COLOR_WARN, hudTextStyle } from '../config/ui-config';
import type { StoreItem, StoreState } from '../core/store';
import { loadStoreState, purchaseStoreItem, setStoreItemEquipped } from '../systems/store-storage';
import { MenuButton, addBuildLabel, menuWrapStyle } from '../ui/menu-ui';
import { formatPoints, storeCardState, storeCardSubJa, storeItemMissionsJa, walletJa, type StoreCardTone } from '../ui/store-texts';
import { STORE_REWARD_ACTION_JA, storeRewardProgressJa } from '../config/trophy-config';
import { rewardProgress } from '../systems/sortie-loadout';

/** 作り直しの時に渡す物（選んでいた品と、保存できなかった時の一言） */
interface StoreInit {
  selected?: number;
  notice?: string;
}

const TONE_COLOR: Record<StoreCardTone, string> = { price: HUD_COLOR_STRONG, short: HUD_COLOR, on: HOME_COLOR_TEXT, off: HUD_COLOR };

export class StoreScene extends Phaser.Scene {
  private cards: MenuButton[] = [];
  private action?: MenuButton;
  private back?: MenuButton;
  private desc?: Phaser.GameObjects.Text;
  private missions?: Phaser.GameObjects.Text;
  private items: readonly StoreItem[] = [];
  private state!: StoreState;
  private selected = 0;
  private notice = '';
  /** ご褒美の進み（v0.9.0 IP3。史実 × デフォルトで達成した任務 / 13。create で 1 回） */
  private progress = { done: 0, total: 0 };
  /** 「本当に交換」の 3 秒（押せば交換・過ぎれば「交換する」へ戻る） */
  private confirm?: Phaser.Time.TimerEvent;
  /** 二重遷移の防止 */
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.store);
  }

  init(d: unknown): void {
    const o = (typeof d === 'object' && d !== null ? d : {}) as StoreInit;
    this.selected = typeof o.selected === 'number' && Number.isInteger(o.selected) ? o.selected : 0;
    this.notice = typeof o.notice === 'string' ? o.notice : '';
    this.cards = [];
    this.confirm = undefined;
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.leaving = false;
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    this.items = getStoreCatalogue(data).items;
    this.state = loadStoreState(data);
    this.progress = rewardProgress(data);
    const n = this.items.length;
    if (this.selected < 0 || this.selected >= n) this.selected = 0;

    addBuildLabel(this);
    this.add.text(STORE_TITLE_X, STORE_TITLE_Y, STORE_TITLE_JA, hudTextStyle(STORE_TITLE_PX, HUD_COLOR_STRONG)).setDepth(DEPTH.hud);
    this.add.text(STORE_TITLE_X, STORE_LEAD_Y, STORE_LEAD_JA, hudTextStyle(STORE_LEAD_PX, HUD_COLOR)).setDepth(DEPTH.hud);
    const wa = storeWalletAnchor(GAME_WIDTH);
    this.add.text(wa.x, wa.y, walletJa(this.state.points), hudTextStyle(STORE_WALLET_PX, HUD_COLOR_STRONG)).setOrigin(1, 0.5).setDepth(DEPTH.hud);

    // 品の格子（1 枚に 題・効きの短い文・右に状態）。押すと選ぶ（説明と主ボタンだけ変わる）
    const compact = n >= STORE_CARD_COMPACT_FROM;
    this.items.forEach((it, i) => {
      const r = storeCardRect(i, n, GAME_WIDTH);
      const st = storeCardState(this.state, it, this.progress);
      const card = new MenuButton(
        this,
        {
          ...r,
          title: it.nameJa,
          titlePx: STORE_CARD_TITLE_PX,
          sub: storeCardSubJa(data, it), // ご褒美（v0.9.0 IP3）は「ご褒美（ハード史実デフォルト全13任務達成）」（IP4）
          subPx: STORE_CARD_SUB_PX,
          ...(compact ? { padY: STORE_CARD_COMPACT_PAD_Y } : {}),
          right: st.text,
          rightPx: STORE_CARD_STATE_PX,
          rightColor: TONE_COLOR[st.tone],
          align: 'left',
        },
        () => this.select(i),
      );
      this.cards.push(card);
    });

    // 下の帯: 説明（格子の下）・効く任務・保存できなかった一言・左下の一言
    const left = storeGridLeft(GAME_WIDTH);
    this.desc = this.add.text(left, storeGridBottom(n) + STORE_DESC_GAP, '', menuWrapStyle(STORE_DESC_PX, HUD_COLOR_STRONG, STORE_DESC_WRAP)).setDepth(DEPTH.hud);
    this.missions = this.add.text(left, 0, '', menuWrapStyle(STORE_DESC_PX, HUD_COLOR, STORE_DESC_WRAP)).setDepth(DEPTH.hud);
    this.add.text(left, GAME_HEIGHT - STORE_MARGIN, STORE_HINT_JA, menuWrapStyle(STORE_HINT_PX, HUD_COLOR, STORE_DESC_WRAP)).setOrigin(0, 1).setDepth(DEPTH.hud);

    this.action = new MenuButton(this, { ...storeActionRect(GAME_WIDTH), title: STORE_BUY_JA, titlePx: STORE_ACTION_PX, sub: '', align: 'center' }, () => this.onAction());
    this.back = new MenuButton(this, { ...storeBackRect(GAME_WIDTH), title: STORE_BACK_JA, titlePx: STORE_BACK_PX, align: 'center' }, () => this.leave());
    this.select(this.selected);
    if (this.notice !== '') {
      const m = this.missions;
      this.add.text(left, m.y + m.height + STORE_DESC_LINE_GAP, this.notice, menuWrapStyle(STORE_DESC_PX, HUD_COLOR_WARN, STORE_DESC_WRAP)).setDepth(DEPTH.hud);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.confirm?.remove(false);
      this.confirm = undefined;
      for (const c of this.cards) c.destroy();
      this.cards = [];
      this.action?.destroy();
      this.action = undefined;
      this.back?.destroy();
      this.back = undefined;
      this.desc = undefined;
      this.missions = undefined;
    });
  }

  /** 品を選ぶ（押した時だけ）: 枠・説明・効く任務・主ボタンを変える（「本当に交換」は取り消す） */
  select(i: number): void {
    const it = this.items[i];
    if (!it || !this.desc || !this.missions) return;
    this.selected = i;
    this.cards.forEach((c, k) => c.setSelected(k === i));
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    if (this.desc.text !== it.descJa) this.desc.setText(it.descJa);
    this.missions.setText(storeItemMissionsJa(data, it));
    this.missions.setY(this.desc.y + this.desc.height + STORE_DESC_LINE_GAP);
    this.resetAction();
  }

  /** 主ボタンを選んだ品の今の状態に（持っていない: 交換する・足りなければ押せず「あと N 点」／持っている: 外す ⇄ 装着する） */
  private resetAction(): void {
    this.confirm?.remove(false);
    this.confirm = undefined;
    const it = this.items[this.selected];
    const a = this.action;
    if (!it || !a) return;
    const s = this.state;
    if (s.owned.includes(it.id)) {
      const on = !s.off.includes(it.id);
      a.setTitle(on ? STORE_UNEQUIP_JA : STORE_EQUIP_JA);
      a.setSub(on ? '今は装着中' : '今は外している');
      a.setEnabled(true);
      return;
    }
    if (it.reward) {
      // まだ渡していないご褒美（v0.9.0 IP3）: 交換できない。進み「ハード史実デフォルト n/13」（IP4）
      a.setTitle(STORE_REWARD_ACTION_JA);
      a.setSub(storeRewardProgressJa(this.progress.done, this.progress.total));
      a.setEnabled(false);
      return;
    }
    const short = it.price - s.points;
    a.setTitle(STORE_BUY_JA);
    a.setSub(short > 0 ? `あと ${formatPoints(short)} 点` : `${formatPoints(it.price)} 点`);
    a.setEnabled(short <= 0);
  }

  /** 主ボタン: 交換は 2 段押し（3 秒の内にもう一度）。交換・装着の入り切りは保存して作り直す */
  private onAction(): void {
    if (this.leaving) return;
    const it = this.items[this.selected];
    if (!it) return;
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    if (this.state.owned.includes(it.id)) {
      setStoreItemEquipped(data, it.id, this.state.off.includes(it.id));
      this.rebuild('');
      return;
    }
    if (it.reward) return; // ご褒美は交換しない（主ボタンは押せない）
    if (!this.confirm) {
      this.action?.setTitle(STORE_CONFIRM_JA);
      this.action?.setSub(`${formatPoints(it.price)} 点 ・ もう一度押す`);
      this.confirm = this.time.delayedCall(STORE_CONFIRM_MS, () => this.resetAction());
      return;
    }
    const r = purchaseStoreItem(data, it.id);
    this.rebuild(r.ok && !r.saved ? STORE_SAVE_FAILED_JA : '');
  }

  private rebuild(notice: string): void {
    this.leaving = true;
    this.scene.restart({ selected: this.selected, notice } satisfies StoreInit);
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(SCENE_KEYS.title);
  }
}
