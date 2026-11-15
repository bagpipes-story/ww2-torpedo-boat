#!/usr/bin/env bash
# v0.8.0 S2 の lead の確かめ: 今の木を作り直して S2-impl の site と同じか（実装の門がこの木で回った証）・npm test・typecheck・lint・us04 の NORADAR A/B（A = B = 今の木）・us04 の決定性
set -u
cd /home/user/ww2-torpedo-boat
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
D=$SP/v0800/impl/S2-lead; S=$D/site; I=$SP/v0800/impl/S2-impl/site
SUM=$D/SUMMARY.txt; : > $SUM
ok(){ echo "✓ $1" >> $SUM; }; ng(){ echo "✗ $1" >> $SUM; }
rm -rf $S && VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=2afe092 npx vite build --outDir $S > $D/build.log 2>&1 && ok build || ng build
bash $SP/v0800/tools/dist-same.sh $S $I > $D/dist-same.log 2>&1; echo "dist-same exit $?" >> $D/dist-same.log
ok "dist-same vs S2-impl/site: $(tail -3 $D/dist-same.log | tr '\n' ' ')"
npm run typecheck > $D/typecheck.log 2>&1 && ok typecheck || ng typecheck
npm run lint > $D/lint.log 2>&1 && ok lint || ng lint
npm test > $D/test.log 2>&1 && ok "npm test $(grep -E 'Tests +[0-9]+ passed' $D/test.log | tail -1 | tr -s ' ')" || ng "npm test (see test.log)"
run(){ local n=$1; shift; env "$@" node scripts/headless/${TOOL}.mjs > $D/$n.log 2>&1; local line; line=$(grep -E '^cases' $D/$n.log | tail -1); echo "$line" | grep -q 'diff 0' && ok "$n $line" || ng "$n $line"; }
TOOL=ab-replay run ab-us04-noradar A=$S B=$S SET=us04 CAM=1 NORADAR=1 JOBS=1
TOOL=ab-replay run ab-us04-same A=$S B=$S SET=us04 CAM=1 JOBS=1
TOOL=hud-ab run hud-us04-noradar A=$S B=$S SET=us04 NORADAR=1 JOBS=2
echo ALL_DONE >> $SUM
