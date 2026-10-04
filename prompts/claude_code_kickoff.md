# 最初のセッションで貼るプロンプト（クラウド・iPhone用）

iPhoneのClaudeアプリ → Code → `ww2-torpedo-boat` → モード「Accept edits」→ 下の `---` の間を貼る。
メモ帳アプリに入れておくと毎回コピーできる。

---

CLAUDE.md を読み、docs/03_開発ロードマップ.md の v0.1.0〜v0.1.3 と docs/02_ゲーム設計書_v0.1.md の §1〜§5 を読んでください。docs/01 は必要な箇所だけ参照。

今回のゴールは v0.1.1「Vite + Phaser 3 + TypeScript のひな形が GitHub Pages で動き、黒い画面にFPSとビルド番号が出る」です。

CLAUDE.md §6 のとおり進めてください：
1. 変更目的とDoneの定義を1行ずつ
2. 作法を3行で要約
3. PATCH単位の分割案（今回は v0.1.1 のみ実装）
4. 実装前に性能・壊れやすさの指摘（§7）
5. 実装 → npm test と npm run build を通す → commit → push → gh pr create
6. 終わったら「Pages URL／期待するビルド番号／iPhoneで試す項目3つ以内／既知の制約」を短く報告

制約：画像・音は作らない。数値は data/*.json から読む。src/core は Phaser を import しない。vite.config.ts は docs/snippets/vite.config.ts を元にする。ローカル実行の案内はしない。CHANGELOG.md に v0.1.1 を追記する。

私はiPhoneからしか確認できません。質問は1つずつ、短くお願いします。

---

## 2回目（v0.1.2 艇の運動）に貼る短い版

```
CLAUDE.md と CHANGELOG.md の最新、docs/03 の v0.1.2 を読んで。今回は v0.1.2「バーチャルスティックで艇が動き、カメラが追従、速力段とHUD」。CLAUDE.md §6 の手順で。終わったら Pages URL・ビルド番号・実機テスト項目3つ以内を報告。
```
