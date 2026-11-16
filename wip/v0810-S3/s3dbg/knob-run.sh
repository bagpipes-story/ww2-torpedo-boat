#!/bin/bash
# S3 のつまみの 1 回: 今の木の data でサイトを作り、ノーマルとハードの表を tableN-<name>-{normal,hard}.txt に（同じビルド番号 main@e9d80ea）
set -u
N=$1; NAME=$2
cd /home/user/ww2-torpedo-boat
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
D=$SP/v0810/impl/S3-impl; S=$SP/v0810/s3dbg/site-$NAME
rm -rf $S && VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=e9d80ea npx vite build --outDir $S > $SP/v0810/s3dbg/build-$NAME.log 2>&1 || { echo build failed; exit 1; }
git diff data/ > $D/table$N-$NAME.data.diff
SITE=$S node scripts/headless/anchor-probe.mjs > $D/table$N-$NAME-normal.txt 2>&1; echo normal exit $?
SITE=$S HARD=1 node scripts/headless/anchor-probe.mjs > $D/table$N-$NAME-hard.txt 2>&1; echo hard exit $?
grep -v "seed " $D/table$N-$NAME-normal.txt $D/table$N-$NAME-hard.txt
