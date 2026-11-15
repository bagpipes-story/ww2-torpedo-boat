#!/bin/bash
# v0.8.0 S1 の作業中の木（commit していない変更と新しいファイル）を notes70 の wip/v0800-S1/ に写して push する。引数は commit の文の尾。
# push は HTTP 503 などで失敗したら 4・8・16・32 秒で再試行（S0 の backup-wip.sh の写し。新しいファイルは files/ にも平文で写す）。
set -e
R=/home/user/ww2-torpedo-boat
N=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/notes70
W=$N/wip/v0800-S1
mkdir -p $W/files
cd $R
git diff > $W/s1.patch
git ls-files --others --exclude-standard -z | tar --null -T - -cf $W/untracked.tar
git ls-files --others --exclude-standard > $W/untracked.txt
git ls-files --others --exclude-standard | while read -r f; do mkdir -p "$W/files/$(dirname "$f")"; cp "$f" "$W/files/$f"; done
git diff --stat > $W/diffstat.txt
git rev-parse HEAD > $W/base.txt
cp /tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0800/impl/S1-tools/*.py $W/tools/ 2>/dev/null || true
cd $N
git add wip/v0800-S1
git commit -q -m "wip/v0800-S1: $1" || true
ok=0
for d in 4 8 16 32; do
  if git push -q origin HEAD:claude/v0.7.0-notes; then ok=1; break; fi
  echo "push failed; retry in ${d}s"; sleep $d
done
[ $ok = 1 ] || git push -q origin HEAD:claude/v0.7.0-notes
git log --oneline -1
