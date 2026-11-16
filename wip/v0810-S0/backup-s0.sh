#!/bin/bash
# v0.8.1 S0 の作業中の diff と新しいファイルを notes70 の wip/v0810-S0/ へ写して push（4/8/16/32 秒で再試行）
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
mkdir -p $N/wip/v0810-S0
cd $R
git diff > $N/wip/v0810-S0/s0.patch
git ls-files --others --exclude-standard -z | tar --null -T - -cf $N/wip/v0810-S0/untracked.tar
cp $SP/v0810/tools/run-gates.sh $SP/v0810/tools/backup-s0.sh $N/wip/v0810-S0/
cd $N
git add wip/v0810-S0
git commit -q -m "wip/v0810-S0: ${1:-backup}" || true
for d in 4 8 16 32; do git push -q origin HEAD:claude/v0.7.0-notes && break || sleep $d; done
git log --oneline -1
