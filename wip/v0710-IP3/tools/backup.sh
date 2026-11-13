#!/bin/bash
# WIP の写し（notes70 の wip/v0710-IP3。音・画像は入れない）。$1 = commit の一言
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
S=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0710/impl/IP3
D=$N/wip/v0710-IP3
rm -rf $D; mkdir -p $D/files $D/tools $D/results
cd $R
git diff HEAD > $D/tracked.patch
UT=$(git ls-files --others --exclude-standard | grep -E '\.(ts|mjs|md|json|sh)$' || true)
for f in $UT; do mkdir -p $D/files/$(dirname $f); cp $f $D/files/$f; done
cp $S/tools/*.ts $S/tools/*.sh $S/tools/*.py $S/tools/lab-shots.mjs $D/tools/ 2>/dev/null || true
cp $S/*.txt $S/*.log $D/results/ 2>/dev/null || true
for m in $S/mix/*/; do n=$(basename $m); cp $m/offline.log $D/results/mix-$n-offline.log 2>/dev/null || true; done
cat > $D/README.md <<EOR
# wip/v0710-IP3 — v0.7.1 実機 3 回目の直し IP3（弾倉の既定を B に＝U-R1・魚雷の発射の新しい案 E〜I・試聴の場の 5 行）の作業の写し（commit の前）

基準: ブランチ claude/v0.7.1-sfx の HEAD $(git rev-parse --short HEAD)（S0〜S5 ＋ IP1 ＋ IP2）。repo では commit していない（lead が長い門を回してから commit する）。
戻し方: \`git checkout $(git rev-parse --short HEAD)\` の木で \`git apply tracked.patch\`、新しいファイルは \`files/\` を上書き。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: ${UT:-なし}
- tools/ … scratchpad の道具（ana3・fpB・lab-shots・mixrun）、results/ … 文字の結果（音・画像は入れない。WAV と声紋は scratchpad の v0710/impl/IP3/sfx）
- 一言: $1
EOR
cd $N && git add -A wip/v0710-IP3 && git commit -qm "wip/v0710-IP3: $1" && (for d in 4 8 16 32; do git push -q 2>&1 && break || sleep $d; done) ; git log --oneline -1
