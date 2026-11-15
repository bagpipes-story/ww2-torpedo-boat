#!/usr/bin/env bash
# S5 WIP backup: the full working-tree diff vs HEAD (tracked + untracked, via a temporary index so the repo index is untouched)
# into notes70 wip/v0800-S5/S5.patch, plus STATUS.md (copied from S5-dev/STATUS.md), commits and pushes with 4/8/16/32 s retries.
set -u
REPO=/home/user/ww2-torpedo-boat
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
NOTES=$SP/notes70
DEST=$NOTES/wip/v0800-S5
MSG=${1:-"wip/v0800-S5: progress"}
mkdir -p "$DEST"
IDX=$(mktemp "$SP/s5-idx.XXXXXX")
rm -f "$IDX"
cp "$REPO/.git/index" "$IDX" 2>/dev/null || true
( cd "$REPO" && GIT_INDEX_FILE="$IDX" git add -A && GIT_INDEX_FILE="$IDX" git diff --cached --binary HEAD ) > "$DEST/S5.patch"
rm -f "$IDX"
( cd "$REPO" && git rev-parse HEAD ) > "$DEST/BASE"
( cd "$REPO" && git status --short ) > "$DEST/GIT-STATUS"
[ -f "$SP/v0800/impl/S5-dev/STATUS.md" ] && cp "$SP/v0800/impl/S5-dev/STATUS.md" "$DEST/STATUS.md"
# scratchpad tools written in S5 (small text files only)
mkdir -p "$DEST/tools"
for f in "$SP"/v0800/impl/S5-dev/tools/*.mjs "$SP"/v0800/impl/S5-dev/tools/*.sh "$SP"/v0800/tools/run-gates.sh; do [ -f "$f" ] && cp "$f" "$DEST/tools/"; done
cd "$NOTES"
git add wip/v0800-S5
if git diff --cached --quiet; then echo "nothing new"; exit 0; fi
git commit -q -m "$MSG" || exit 1
for d in 0 4 8 16 32; do
  [ $d -gt 0 ] && { echo "retry in $d s"; sleep $d; }
  if git push -q origin claude/v0.7.0-notes 2>&1; then echo "pushed: $MSG"; exit 0; fi
done
echo "PUSH FAILED"; exit 1
