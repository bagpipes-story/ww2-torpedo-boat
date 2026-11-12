#!/usr/bin/env bash
# v0.7.1 S3 の作業の写しを notes70（別ブランチ）へ: 変えた・足したファイル（git status）を wip/v0710-S3/files/ に、追跡済みの差分を tracked.patch に、
# scratchpad の道具を tools/ に、文字の結果を results/ に写して commit・push（フォルダは作り直す）。音・画像は入れない。
set -eu
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
R=/home/user/ww2-torpedo-boat; N=$SP/notes70; W=$N/wip/v0710-S3; D=$SP/v0710/impl/S3
rm -rf $W; mkdir -p $W/files $W/tools $W/results
cd $R
git status --short | awk '{print $2}' | while read -r f; do
  [ -f "$f" ] || continue
  mkdir -p "$W/files/$(dirname "$f")"; cp "$f" "$W/files/$f"
done
git diff > $W/tracked.patch
cp $D/tools/*.mjs $D/tools/*.sh $D/tools/*.txt $W/tools/ 2>/dev/null || true
rm -f $W/tools/sfx-mix.mjs
for f in probe-final.log mix-final.log mix-busy.log offline-final.log sfx-live.log heap-audio.log perf-audio.log build-frames.log ab-audio-state.log sfx/numbers.txt; do [ -f $D/$f ] && cp $D/$f $W/results/$(basename $f); done
cp $SP/v0710/impl/S3-quick-us02/SUMMARY.txt $W/results/SUMMARY-quick-us02.txt
cp $SP/v0710/impl/S3-quick-jp03h/SUMMARY.txt $W/results/SUMMARY-quick-jp03h.txt
grep -E "Test Files|Tests " $D/agent-npm-test.log > $W/results/npm-test-tail.txt || true
cp $D/README-wip.md $W/README.md
cd $N && git add -A wip/v0710-S3 && git commit -q -m "${1:-wip/v0710-S3: v0.7.1 S3（ループ）の作業の写し}

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FFamytCg2edHr8RBr7eBa7" && git push -q origin HEAD && git log --oneline | head -1
