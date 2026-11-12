#!/usr/bin/env bash
# v0.7.1 S3 の作業の写しを notes70（別ブランチ）へ: 変えた・足したファイル（git status）を wip/v0710-S3/files/ に写して commit・push。音・画像は入れない。
set -eu
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
R=/home/user/ww2-torpedo-boat; N=$SP/notes70; W=$N/wip/v0710-S3
rm -rf $W/files; mkdir -p $W/files $W/tools
cd $R
git status --short | awk '{print $2}' | while read -r f; do
  [ -f "$f" ] || continue
  mkdir -p "$W/files/$(dirname "$f")"; cp "$f" "$W/files/$f"
done
cp $SP/v0710/impl/S3/tools/*.mjs $SP/v0710/impl/S3/tools/*.sh $W/tools/ 2>/dev/null || true
rm -f $W/tools/sfx-mix.mjs
cp $SP/v0710/impl/S3/README-wip.md $W/README.md
cd $N && git add -A wip/v0710-S3 && git commit -q -m "${1:-wip/v0710-S3: v0.7.1 S3（ループ）の作業の写し}

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FFamytCg2edHr8RBr7eBa7" && git push -q origin HEAD && git log --oneline | head -1
