#!/bin/bash
# v0.8.4 の作業中の diff と新しいファイルを notes70 の wip/v0840/ へ写して push（4/8/16/32 秒で再試行）
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
mkdir -p $N/wip/v0840
cd $R
git diff > $N/wip/v0840/v0840.patch
git ls-files --others --exclude-standard -z | tar --null -T - -cf $N/wip/v0840/untracked.tar
cp $SP/v0840/tools/run-gates.sh $SP/v0840/tools/backup.sh $N/wip/v0840/
cp $SP/v0840/plan/brief-v0840.md $N/wip/v0840/ 2>/dev/null || true; [ -f $SP/v0840/impl/v0840-impl/SUMMARY.txt ] && cp $SP/v0840/impl/v0840-impl/SUMMARY.txt $N/wip/v0840/ || true
cd $N
git add wip/v0840
git commit -q -m "wip/v0840: ${1:-backup}" || true
for d in 4 8 16 32; do git push -q origin HEAD:claude/v0.7.0-notes && break || sleep $d; done
git log --oneline -1
