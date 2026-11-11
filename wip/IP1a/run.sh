#!/bin/bash
# 使い方: run.sh <出力dir>  （PARAMS・LIGHT・GRID・GRIDA・SC は環境変数）
T=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0700/impl/IP1a/tools
cd /home/user/ww2-torpedo-boat && npx esbuild $T/preview.ts --bundle --platform=node --format=esm --outfile=$T/preview.mjs --log-level=warning && mkdir -p $1 && OUT=$1 node $T/preview.mjs
