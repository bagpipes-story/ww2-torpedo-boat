#!/bin/bash
# run-ts.sh <file.ts> : esbuild で束ねて node で回す（repo の src を読む）
set -e
F=$1; O=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0820/s4/out-$(basename $F .ts).mjs
/home/user/ww2-torpedo-boat/node_modules/.bin/esbuild "$F" --bundle --platform=node --format=esm --outfile=$O --log-level=error --loader:.json=json
node $O
