#!/usr/bin/env bash
# v0.7.0 の段の門をまとめて回す: run-gates.sh <stage>（例 S2b）。結果は $D/SUMMARY.txt（1 門 1 行 ✓/✗）と各 log。最後に ALL_DONE。
set -u
STAGE=${1:?stage}
cd /home/user/ww2-torpedo-boat
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
D=$SP/v0700/impl/$STAGE; mkdir -p $D
A=$SP/v0700/base-f5563ab; B=$D/site
SUM=$D/SUMMARY.txt; : > $SUM
ok(){ echo "✓ $1" >> $SUM; }; ng(){ echo "✗ $1" >> $SUM; }
rm -rf $B && VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=f5563ab npx vite build --outDir $B > $D/build.log 2>&1 && ok build || ng build
npm run typecheck > $D/typecheck.log 2>&1 && ok typecheck || ng typecheck
npm run lint > $D/lint.log 2>&1 && ok lint || ng lint
npm test > $D/test.log 2>&1 && ok "npm test $(grep -E 'Tests +[0-9]+ passed' $D/test.log | tail -1 | tr -s ' ')" || ng "npm test (see test.log)"
G6=1 ALLY=1 EVAC=1 OUTDIR=$D/g2 bash scripts/headless/g2.sh > $D/g2.log 2>&1 && ok "g2 $(grep -o 'OK [0-9]* DIFF [0-9]*' $D/g2.log | tail -1)" || ng "g2 $(grep -o 'OK [0-9]* DIFF [0-9]*' $D/g2.log | tail -1)"
abrun(){ # name tool set cam
  local n=$1 t=$2 s=$3 c=$4
  A=$A B=$B SET=$s CAM=$c JOBS=3 node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if echo "$line" | grep -q 'diff 0'; then ok "$n $line"; else ng "$n $line"; fi
}
abrun ab-all ab-replay all 1
abrun ab-jp04base ab-replay jp04base 1
abrun ab-jp03 ab-replay jp03 1
abrun hud-base hud-ab base 0
abrun hud-jp04base hud-ab jp04base 0
abrun hud-jp03 hud-ab jp03 0
# 既知の揺れ: nodawn/result の us_02 seed 1 の最後のフレームの .t。ab-all が diff 1 なら単独で再実行
if grep -q '^✗ ab-all' $SUM; then
  A=$A B=$B SET=result CAM=1 JOBS=1 ONLY=us_02 node scripts/headless/ab-replay.mjs > $D/ab-rerun.log 2>&1
  grep -E '^cases' $D/ab-rerun.log | tail -1 | grep -q 'diff 0' && ok "ab-all rerun of the flaky case: $(grep -E '^cases' $D/ab-rerun.log | tail -1)" || ng "ab-all rerun still differs (see ab-rerun.log)"
fi
A=$A B=$B CHECK=1 JOBS=3 OUT=$D/tex-ab.json node scripts/headless/tex-ab.mjs > $D/tex-ab.log 2>&1 && ok "tex-ab CHECK=1 $(grep -c '✗' $D/tex-ab.log) ✗ lines" || ng "tex-ab (see tex-ab.log)"
A=$A B=$B ROUNDS=2 OUT=$D/art-perf.json node scripts/headless/art-perf.mjs > $D/art-perf.log 2>&1 && ok "art-perf $(tail -1 $D/art-perf.log | cut -c1-80)" || ng "art-perf $(tail -1 $D/art-perf.log | cut -c1-120)"
git -C /home/user/ww2-torpedo-boat diff --quiet HEAD -- tests/__snapshots__ 2>/dev/null && ok "snapshots untouched" || ng "snapshots changed"
echo ALL_DONE >> $SUM; echo ALL_DONE
