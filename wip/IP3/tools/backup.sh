#!/bin/bash
set -e
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
N=$SP/notes70
cd $N && git fetch -q origin claude/v0.7.0-notes && git reset -q --hard origin/claude/v0.7.0-notes
D=$N/wip/IP3
rm -rf $D && mkdir -p $D/untracked
cd /home/user/ww2-torpedo-boat
git diff HEAD > $D/diff-HEAD.patch
git rev-parse HEAD > $D/BASE
git ls-files --others --exclude-standard | while read f; do mkdir -p "$D/untracked/$(dirname "$f")"; cp "$f" "$D/untracked/$f"; done
mkdir -p $D/tools && cp $SP/v0700/impl/IP3/tools/*.mjs $SP/v0700/impl/IP3/tools/*.sh $SP/v0700/impl/IP3/tools/*.py $D/tools/ 2>/dev/null || true; cd $N && git add wip/IP3 && git commit -q -m "wip IP3: $1" && git push -q origin HEAD:claude/v0.7.0-notes && git rev-parse --short HEAD
