#!/bin/bash
# 曲の道具を今の木で束ねて回す: m.sh report|search|ana [引数]
S=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1
cd /home/user/ww2-torpedo-boat
case "$1" in
  report) npx esbuild scripts/sfx-music.ts --bundle --platform=node --format=esm --outfile=$S/tools/sfx-music.mjs --log-level=warning && shift && node $S/tools/sfx-music.mjs "$@";;
  search) npx esbuild scripts/sfx-music.ts --bundle --platform=node --format=esm --outfile=$S/tools/sfx-music.mjs --log-level=warning && SEARCH=1 node $S/tools/sfx-music.mjs;;
  ana) npx esbuild $S/tools/ana.ts --bundle --platform=node --format=esm --alias:@repo=/home/user/ww2-torpedo-boat --outfile=$S/tools/ana.mjs --log-level=warning && shift && node $S/tools/ana.mjs "$@";;
esac
