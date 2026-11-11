# v0.7.0 user decisions (binding; 2026-11-07)

U1 (the user's choice in the question dialog, verbatim): question 「次は v0.7.0「アートと音」（艇・艦の絵、夜の海の演出、効果音・BGM）です。CLAUDE.md には「画像・音の制作にセッションを使わない」とあります。素材の出どころをどうしますか？」 → answer 「コードで描く・鳴らす（推奨）」.
 The option text the user picked: 今回の屋我地の陰と同じやり方で艇・艦・海をコードで描き直し、効果音も音のファイルを使わず合成（機銃・爆発・エンジン・波など）。権利の心配なし・追加ダウンロードなし・オフラインでも軽い。BGM は単純な曲になる。CLAUDE.md の「制作にセッションを使わない」はこの形に限って解く。
 → CLAUDE.md §2「アート」: v0.7 からの絵と音はコードで描く・合成する（外部の画像・音のファイルを使わない）。
U0 context: the user praised the procedurally drawn 屋我地の陰 (v0.6.11 IP2): 「いいグラフィックです。それでは次へ進めてください」.

Lead plan (not user decisions): v0.7.0 = ship/boat/plane art + night-sea effects (this version); v0.7.1 = synthesized SFX (unlock on first touch, mute toggle); v0.7.2 = synthesized BGM + hit slow-mo polish.

## U2–U5 (v0.7.0 iPhone round 1, 2026-11-11, the user's words verbatim)
「波の模様が波に見えずにゴミのように見えます。いい方法があれば改良して欲しいです。また、波があったとしても格子の線はあった方がいいです。
また、たびたびFPSを気にしますが、全く問題なく動くのでもっと派手な演出、数でも大丈夫だと思います。
沿岸砲もリメイクお願いします。
航跡が直線すぎるので少し揺らぎを出してください。」
- U2 sea pattern reads as garbage → redraw as a sea surface (lead: full-screen tiled sea, smooth swell + slowly drifting crests). Grid lines stay ON (the user's decision).
- U3 FPS is fine on the user's iPhone → more flashy effects and higher counts are OK. Lead budget: frame p95 ≤ ×1.40 vs base (was ×1.15), visible objects ≤ +150 (was +40), GPU ≤ +24 MB; §7 structure rules unchanged (pools, draw once, no per-frame alloc).
- U4 shore battery remade (no more red square).
- U5 wakes too straight → trail along the real path with sway (lead: pooled foam puffs laid at the stern positions).
