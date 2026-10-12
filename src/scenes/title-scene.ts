// Title: ゲーム名と任務一覧（米PTキャンペーンの playable_from を持つ任務を order 順。出撃できない任務は「準備中 ・ 版」で押せない）。docs/02 §4、v0.4.0。
// 静的な画面: 物体は create で 1 回だけ作り、update は持たない（§7）。任務を選ぶと出撃の seed を決めて Briefing へ。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, REGISTRY_KEY_DATA, REGISTRY_KEY_PENDING_SORTIE, RENDER_SCALE, SCENE_KEYS, sortieSeed } from '../config/game-config';
import { getGameData } from '../config/game-data';
import { getMenuEntries } from '../config/mission-data';
import {
  TITLE_CAMPAIGN_PX,
  TITLE_CAMPAIGN_SUFFIX_JA,
  TITLE_CAMPAIGN_Y,
  TITLE_HINT_JA,
  TITLE_HINT_PX,
  TITLE_HINT_Y,
  TITLE_LOGO_PX,
  TITLE_LOGO_TEXT,
  TITLE_LOGO_Y,
  TITLE_ROW_GAP,
  TITLE_ROW_H,
  TITLE_ROW_STATUS_PX,
  TITLE_ROW_SUB_PX,
  TITLE_ROW_TITLE_PX,
  TITLE_ROW_TOP,
  TITLE_ROW_W,
  TITLE_ROW_X,
} from '../config/menu-config';
import { HOME_COLOR_TEXT, HUD_COLOR, HUD_COLOR_STRONG, hudTextStyle } from '../config/ui-config';
import { seedForBriefing, type BriefingInit } from '../core/sortie';
import { MenuButton, addBuildLabel } from '../ui/menu-ui';

export class TitleScene extends Phaser.Scene {
  private rows: MenuButton[] = [];
  /** 二重遷移の防止（同じフレームで 2 度 scene.start すると 2 つ起動する） */
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.title);
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.leaving = false;
    this.rows = [];
    const menu = getMenuEntries(getGameData(this.registry, REGISTRY_KEY_DATA));
    const cx = GAME_WIDTH / 2;

    addBuildLabel(this);
    this.add.text(cx, TITLE_LOGO_Y, TITLE_LOGO_TEXT, hudTextStyle(TITLE_LOGO_PX, HUD_COLOR_STRONG)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
    this.add.text(cx, TITLE_CAMPAIGN_Y, `${menu.campaignName}${TITLE_CAMPAIGN_SUFFIX_JA}`, hudTextStyle(TITLE_CAMPAIGN_PX, HUD_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
    menu.entries.forEach((e, i) => {
      const row = new MenuButton(
        this,
        {
          x: TITLE_ROW_X,
          y: TITLE_ROW_TOP + i * (TITLE_ROW_H + TITLE_ROW_GAP),
          w: TITLE_ROW_W,
          h: TITLE_ROW_H,
          title: e.title,
          titlePx: TITLE_ROW_TITLE_PX,
          sub: e.sub,
          subPx: TITLE_ROW_SUB_PX,
          right: e.status,
          rightPx: TITLE_ROW_STATUS_PX,
          rightColor: e.playable ? HOME_COLOR_TEXT : HUD_COLOR,
          align: 'left',
        },
        () => this.open(e.id),
      );
      row.setEnabled(e.playable);
      this.rows.push(row);
    });
    this.add.text(cx, TITLE_HINT_Y, TITLE_HINT_JA, hudTextStyle(TITLE_HINT_PX, HUD_COLOR)).setOrigin(0.5, 0).setDepth(DEPTH.hud);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const r of this.rows) r.destroy();
      this.rows = [];
    });
  }

  /** 任務を選ぶ: 同じ任務の保留（Briefing で選ぶ前に戻った夜）があればその seed、無ければ新しい seed で Briefing へ */
  private open(missionId: string): void {
    if (this.leaving) return;
    this.leaving = true;
    const init: BriefingInit = { missionId, seed: seedForBriefing(this.registry.get(REGISTRY_KEY_PENDING_SORTIE), missionId, sortieSeed()) };
    this.registry.set(REGISTRY_KEY_PENDING_SORTIE, init);
    this.scene.start(SCENE_KEYS.briefing, init);
  }
}
