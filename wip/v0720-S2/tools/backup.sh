#!/bin/bash
# WIP の写し（notes70 の wip/v0720-S2。音・画像は入れない）。$1 = commit の一言
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
S=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S2
D=$N/wip/v0720-S2
rm -rf $D; mkdir -p $D/files $D/tools $D/results
cd $R
git diff HEAD > $D/tracked.patch
UT=$(git ls-files --others --exclude-standard | grep -E '\.(ts|mjs|md|json|sh)$' || true)
for f in $UT; do mkdir -p $D/files/$(dirname $f); cp $f $D/files/$f; done
cp $S/tools/* $D/tools/ 2>/dev/null || true
cp $S/*.txt $S/*.log $D/results/ 2>/dev/null || true
cat > $D/README.md <<EOR
# wip/v0720-S2 — v0.7.2 S2「任務の曲（U-M1）」の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD $(git rev-parse --short HEAD)（S0・S1）。repo では commit していない（lead が門を回してから commit する）。
戻し方: \`git checkout $(git rev-parse --short HEAD)\` の木で \`git apply tracked.patch\`、新しいファイルは \`files/\` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: ${UT:-なし}
- tools/ … scratchpad の道具、results/ … 文字の結果（音・画像は入れない）
- 一言: $1
EOR
cd $N && git add -A wip/v0720-S2 && git commit -qm "wip/v0720-S2: $1" && (for d in 4 8 16 32; do git push -q 2>&1 && break || sleep $d; done) ; git log --oneline -1
