# v0.7.0 の基準の画面写し（main f5563ab・絵を変える前）

- 撮り方: `/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0700/impl/plan/shots.mjs`（SITE=`.../v0700/base-f5563ab`、`?debug&mission=<id>&seed=<n>` で直行・dpr 2＝RENDER_SCALE 1.0915（W 1560）/1.0415（W 1280）＝iPhone と同じ密度）。
  ab-replay の台本で最寄りの敵へ寄り（1,500 m の内は静音 0.22、近すぎれば背を向ける）、敵の絵が画面の内に 7 フレーム続くか stopM の内で止め、70 回描いてカメラを追いつかせて 1 枚。
  `?debug` の距離の円は隠す（見越し点の小さな輪は残る）。`-lookout` は続けて見張り（ズーム 0.5）で 90 フレーム後。`-reveal` は夜で見えていない敵の絵を参考のために出したもの（遊びの画面ではない）。
- 名前: `<件>-w<幅>.png`・`<件>-lookout-w<幅>.png`・`<件>-reveal-w<幅>.png`。ページのエラーは全件 0。

| 件 | query | 止めた t（秒） | 写っている世界の絵（W 1560） |
| --- | --- | --- | --- |
| us_01 | mission=us_01&seed=1 | 36.6 | Elco 77（自艇・僚艇は青の tint）・駆逐艦（画面上端）・探照灯・水柱 |
| us_01-dawn | &dawn=25 | 32.8 | 夜明け後の海（昼の色）・敵機 4（十字）・僚艇 |
| us_02 | mission=us_02&seed=1 | 28.9 | Elco 80・駆逐艦（上端）・輸送船・探照灯・曳光弾・水柱（輪） |
| us_02-hard | &hard | 26.3 | 駆逐艦 2・輸送船・曳光弾 6・水柱 18 |
| us_03 | mission=us_03&seed=1 | 48.0 | Elco 80・大発 2・浅瀬・岸・沿岸砲の射界 |
| jp_01（-reveal） | mission=jp_01&seed=1 | 70.0 | T-38・味方の大発 3（青）・米PT 2（reveal） |
| jp_01-hard（-reveal） | &hard | 70.0 | ＋隼艇 H-38（青の tint）・米PT 3（reveal） |
| jp_02 | mission=jp_02&seed=1 | 14.8 | T-14・夜の哨戒機 2（十字） |
| jp_03 | mission=jp_03&seed=1 | 31.9 | 昼の海・壕 3（岩と木の絵）・18 隻（T-38）・敵機 4・輪 |
| jp_04 | mission=jp_04&seed=2 | 50.6 | T-38・米PT・卯月（青）と扇・味方の輸送船 |
| jp_04-hard | &hard | 50.6 | 同上（米PT 3 隻の夜） |
| jp_05 | mission=jp_05&seed=1 | 23.7 | T-14・米PT |
| jp_06 | mission=jp_06&seed=1 | 36.2 | T-38・米駆逐艦（今は日本の駆逐艦と同じ絵）・探照灯・水柱 |

us_04〜us_07 は遊べる世界（`v0_1_prototype`）が無く、`?debug&mission=` は us_02 に落ちるので撮っていない（13 記録のうち遊べるのは 9。上の 13 件＝9 任務＋ハード 3＋夜明け 1）。
