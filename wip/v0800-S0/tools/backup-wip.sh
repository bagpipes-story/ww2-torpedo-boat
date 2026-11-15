#!/bin/bash
# v0.8.0 S0 の作業中の木（commit していない変更と新しいファイル）を notes70 の wip/v0800-S0/ に写して push する。引数は commit の文の尾。
# push は HTTP 503 などで失敗したら 4・8・16・32 秒で再試行。
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
W=$N/wip/v0800-S0
mkdir -p $W/files
cd $R
git diff > $W/s0.patch
git ls-files --others --exclude-standard -z | tar --null -T - -cf $W/untracked.tar
git ls-files --others --exclude-standard > $W/untracked.txt
git diff --stat > $W/diffstat.txt
git rev-parse HEAD > $W/base.txt
cd $N
git add wip/v0800-S0
git commit -q -m "wip/v0800-S0: $1" || true
ok=0
for d in 4 8 16 32; do
  if git push -q origin HEAD:claude/v0.7.0-notes; then ok=1; break; fi
  echo "push failed; retry in ${d}s"; sleep $d
done
[ $ok = 1 ] || git push -q origin HEAD:claude/v0.7.0-notes
git log --oneline -1
