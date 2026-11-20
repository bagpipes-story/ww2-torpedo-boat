#!/bin/bash
# v0.8.2 IP2 の作業中の diff と新しいファイルを notes70 の wip/v0820-IP2/ へ写して push（4/8/16/32 秒で再試行）
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
mkdir -p $N/wip/v0820-IP2
cd $R
git diff > $N/wip/v0820-IP2/ip2.patch
git ls-files --others --exclude-standard -z | tar --null -T - -cf $N/wip/v0820-IP2/untracked.tar
cp $SP/v0820/tools/run-gates.sh $SP/v0820/tools/backup-ip2.sh $N/wip/v0820-IP2/
mkdir -p $N/wip/v0820-IP2/ip2 && cp $SP/v0820/ip2/*.mjs $SP/v0820/ip2/*.sh $SP/v0820/ip2/*.txt $SP/v0820/ip2/*.py $N/wip/v0820-IP2/ip2/ 2>/dev/null || true
cp $SP/v0820/plan/brief-IP2.md $N/wip/v0820-IP2/ 2>/dev/null || true; [ -f $SP/v0820/impl/IP2-impl/SUMMARY.txt ] && cp $SP/v0820/impl/IP2-impl/SUMMARY.txt $N/wip/v0820-IP2/ || true
cd $N
git add wip/v0820-IP2
git commit -q -m "wip/v0820-IP2: ${1:-backup}" || true
for d in 4 8 16 32; do git push -q origin HEAD:claude/v0.7.0-notes && break || sleep $d; done
git log --oneline -1
