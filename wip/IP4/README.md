# v0.7.0 IP4 の WIP（claude/v0.7.0-art の d499360 の上。未 commit の作業木の写し）

- `ip4.diff` = `git diff HEAD`（新しいファイル src/core/own-light.ts・tests/own-light.test.ts は `files/` にだけある）。`files/` は変えたファイルの全文。
- Fix 1（絵だけ）: jp_04 の輸送船が魚雷で沈む時も 'torpedo'（大きな水柱）。world-landing → onSunk(x, y, 'torpedo') → onTargetDestroyed(x, y, look) → playExplosion(…, look)。ExplosionLook は world-events へ。
- Fix 2（不具合）: destroyer-group.othersOwnLit(i) が他の艦の自分の光（core/own-light の litByOwnLight）だけを読む（他の艦の illuminated の輪をやめた）。
- `bug/`: lead の再現 repro.ts・repro2.ts と直した後の版（-after.ts）と出力（-before/-after.txt）。
- A/B の記録: scratchpad の v0700/impl/IP4/ab-site（今の木）・ab-site-rev（Fix 2 だけ戻した木）。
