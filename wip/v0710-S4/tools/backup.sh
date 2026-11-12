#!/bin/bash
# WIP の写し（notes70 の wip/v0710-S4。音・画像は入れない）。$1 = commit の一言
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
S=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/S4
D=$N/wip/v0710-S4
rm -rf $D; mkdir -p $D/files $D/tools $D/results
cd $R
git diff HEAD > $D/tracked.patch
for f in $(git ls-files --others --exclude-standard | grep -E '\.(ts|mjs|md|json|sh)$'); do mkdir -p $D/files/$(dirname $f); cp $f $D/files/$f; done
cp $S/tools/*.ts $S/tools/*.mjs $S/tools/*.sh $D/tools/ 2>/dev/null || true
cp $S/sfx/*.txt $D/results/ 2>/dev/null || true
cp $S/*.log $D/results/ 2>/dev/null || true
cat > $D/README.md <<EOR
# wip/v0710-S4 — v0.7.1 S4「合図・UI・Result」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD $(git rev-parse --short HEAD)（S0〜S3）。repo では commit していない（lead が長い門を回してから commit する）。
戻し方: \`git checkout $(git rev-parse --short HEAD)\` の木で \`git apply tracked.patch\`、新しいファイルは \`files/\` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: $(git ls-files --others --exclude-standard | grep -E '\.(ts|mjs|md|json|sh)$' | tr '\n' ' ')
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: $1
EOR
cd $N && git add -A wip/v0710-S4 && git commit -qm "wip/v0710-S4: $1" && git push -q 2>&1 | tail -2; git log --oneline -1
