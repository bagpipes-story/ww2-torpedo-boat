#!/bin/bash
# WIP の写し（notes70 の wip/v0720-S0。音・画像は入れない）。$1 = commit の一言
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
S=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S0
T=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/tools
D=$N/wip/v0720-S0
rm -rf $D; mkdir -p $D/files $D/tools $D/results
cd $R
git diff HEAD > $D/tracked.patch
UT=$(git ls-files --others --exclude-standard | grep -E '\.(ts|mjs|md|json|sh)$' || true)
for f in $UT; do mkdir -p $D/files/$(dirname $f); cp $f $D/files/$f; done
cp $S/tools/*.ts $S/tools/*.sh $S/tools/*.mjs $D/tools/ 2>/dev/null || true
rm -f $D/tools/sfx-music.mjs $D/tools/prof.mjs $D/tools/parts.mjs
cp $T/run-gates.sh $D/tools/run-gates.sh 2>/dev/null || true
cp $S/*.txt $S/*.log $D/results/ 2>/dev/null || true
cat > $D/README.md <<EOR
# wip/v0720-S0 — v0.7.2 S0（骨組みと道具: 曲の定数・作曲器・合成・分けて描く・試聴の数の道具。鳴らない）の作業の写し（commit の前）

基準: ブランチ claude/v0.7.2-bgm の HEAD $(git rev-parse --short HEAD)（main 35e9e77＝v0.7.1）。repo では commit していない（lead が門を回してから commit する）。
戻し方: \`git checkout $(git rev-parse --short HEAD)\` の木で \`git apply tracked.patch\`、新しいファイルは \`files/\` を写す。
- tracked.patch … 追跡済みのファイルの git diff HEAD
- files/ … 新しいファイル（git の追跡外）: ${UT:-なし}
- tools/ … scratchpad の道具（Chromium の費用の測り bench-*・kern-*、prof・parts・tabbench・fxbench、backup.sh、v0720/tools/run-gates.sh の写し）、results/ … 文字の結果（音・画像は入れない。WAV・PNG は scratchpad の v0720/impl/S0/music）
- 一言: $1
EOR
cd $N && git add -A wip/v0720-S0 && git commit -qm "wip/v0720-S0: $1" && (for d in 4 8 16 32; do git push -q 2>&1 && break || sleep $d; done) ; git log --oneline -1
