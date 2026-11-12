# wip/v0710-S1 — v0.7.1 S1「鳴る縦切り」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD a1e08c8（S0）。repo では commit していない（lead が長い門を回してから commit する）。
コンテナが作り直されたら、この写しから戻す: `git checkout a1e08c8` の木に `files/` を上書きする（`tracked.patch` は追跡済みの 13 本の差分。新しい 9 本は `files/` だけにある）。

## 入っている物

- `files/` … 変えた・足したファイルの全部（22 本）
  - 新: `src/systems/sfx-audio-types.ts`・`sfx-engine.ts`・`sfx-bus.ts`・`sfx-boot.ts`・`sfx-settings.ts`、`tests/sfx-engine.test.ts`・`sfx-settings.test.ts`・`title-sound.test.ts`、`scripts/headless/sfx-live.mjs`
  - 変: `src/config/sfx-config.ts`・`menu-config.ts`・`title-layout-config.ts`、`src/scenes/boot-scene.ts`・`title-scene.ts`、`src/systems/world-art.ts`・`fx-bus.ts`・`explosion-fx.ts`、`src/ui/menu-ui.ts`、`tests/sfx-rules.test.ts`・`sfx-inventory.test.ts`、`CHANGELOG.md`、`docs/03_開発ロードマップ.md`
- `tracked.patch` … 追跡済みのファイルの `git diff`
- `tools/` … scratchpad の道具（repo には入れない）: `title-shots.mjs`（Title を論理幅 1280・1560・1584 で撮り、物の箱と重なりを出す）・`boot-time.mjs`（Boot の create と音の起動の壁時計を A/B）・`gun-path.mjs`（偽の時計で本物の機銃・爆発が音の口まで届くか）
- `results/` … 短い門と計測の文字の結果（画像・音は入れない）

## 確かめた事（agent。長い門は lead）

- `npm run typecheck`・関係するテスト（sfx-*・title-sound・art-rules・fx-art*・title-grid）は通る。`npm test` の全部と `npm run build` は README を書いた後に回した（報告を見る）。
- `scripts/headless/sfx-live.mjs`: AUDIO=1・既定（本物のタップで unlock）・既定の直行（suspended のまま＝音源 0）・NOAUDIO=1 がどれも OK。
- 短い A/B（main 3a9e7aa と同じビルド番号）: us_02 20 秒・jp_03 ハード 40 秒と、音の鳴る長い 5 件を、音の 3 つの状態で＝全部 same:true（`results/`）。

## 計画とのずれ（報告にも書いた）

- Title の一言は「音」ボタンの下ではなく左（論理幅 1280 でタブと重なるため）。
- 最初の音の立ち上がりは 0 からではなく 0.3 倍から 0.3 秒（最初のタップの 0.06 秒の音が聞こえるように）。
- 最初のタップの UI の音を 1 つだけ覚えて、context が動き出したら鳴らす（計画には無い。無いと最初に押したボタンだけ鳴らない）。
- 小さい爆発（dud）は blast_l を音量 0.45・速さ 1.8 倍で鳴らす代わりの音（S2 の blast_s まで）。
- 見張りは「進まないまま 3 回まで」の上限つき。構造の型は `sfx-audio-types.ts` に分けた（エンジンが 300 行に近かった）。
- `tests/sfx-rules` の注釈を消す正規表現の穴を直した（行の注釈の中の `data/*.json` を塊の注釈の始まりと読んでいた）。
