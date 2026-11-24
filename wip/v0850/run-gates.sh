#!/usr/bin/env bash
# v0.8.5 の門をまとめて回す（v0840/tools/run-gates.sh の写し。基準 main 38acd73＝v0.8.4 のマージ・今の木も main@38acd73 で作る。
# v0.8.5 で変えた所: 基準に史実モードの乱射があるので histsmoke も「同じはず」（v0.8.4 では違うはず）。A05 の既定は基準）。以下は v0.8.4 までの注のまま
# v0.8.2 の段の門をまとめて回す: run-gates.sh <stage>（例 S0-impl）。結果は $D/SUMMARY.txt（1 門 1 行 ✓/✗）と各 log。最後に ALL_DONE。
# v0810/tools/run-gates.sh の写し（v0.8.2 の S0・lead の L1）。変えた所:
#   - 基準は main 0176202（v0.8.1 のマージ。v0820/base-0176202＝v0820/wt-0176202 で VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=0176202
#     npx vite build。今の木も同じビルド番号 main@0176202 で作って比べる）・出力は v0820/impl/<stage>/。
#   - us_06 の組（SKIP の名前 us06）: us_06 は基準にある（main に入った）ので、ab-us06・hud-us06 は us_04 の組と同じく A＝基準・B＝今の木で濾しなし（SET=us06）。
#     v0.8.1 の A06（S2 の commit のビルド）と ANCHORUI の濾しの枝は消した。
#   - us_05 の組（SET=us05。SKIP の名前 us05）: S2 は A＝B＝今の木（決定性とページのエラー＝lead の L25）。S2b から lead が A を S2 の commit のビルドのサイトに向ける（A05 で上書き）。
#   - JOBS の既定は 2（v0.8.2 の lead の brief: 並列は 2 まで）。
#   - S4（担当の L48）: us_05 の組は RECONUI=1（scripts/headless/recon-filter。S4 の新しい 2 行目の文と中継の端の印だけを両方の側で隠す・世界の写しは全部比べる）。RECONUI=0 で濾しなし。
# 以下は v0.8.1 の写しの説明のまま:
#   - us_04 の組（SKIP の名前 us04）: ab-us04・hud-us04 は A＝基準・B＝今の木で濾しなし（SET=us04）。
#     ab-us04-noradar・hud-us04-noradar は A＝B＝今の木で NORADAR=1。
#   - g2 は既定で US04=1。
#   - art-perf は既定で飛ばす（SKIP の既定 "art-perf"。回すなら SKIP="" で）。
#   - snapshots の門は git status で「変わった・新しい」写しのファイルを名指す。
# 再生の A/B を音の 3 つの状態で回す（scripts/headless/lib.mjs の環境変数）:
#   default＝今までどおり（AudioContext は suspended）・audio＝AUDIO=1（autoplay を許す＝running）・noaudio＝NOAUDIO=1（AudioContext なし＝音のエンジンが無い）
# 環境変数:
#   AUDIO_STATES（既定 "default audio noaudio"）: ab-replay all 58 と hud-ab base 16 を回す状態
#   SMALL_AUDIO_STATES（既定 "default"）: 小さい組（ab-replay・hud-ab の jp04base 8・jp03 4）を回す状態
#   SKIP（既定 "art-perf"。空白区切り）: 飛ばす門 build typecheck lint test g2 ab hud us04 us06 us05 us07 hist tex-ab art-perf snapshots（us07 は v0.8.5 S2 の組。A07 の既定は今の木）（build を飛ばすと $D/site をそのまま使う）
#   A05（既定 今の木の $D/site）: us_05 の組の A（S2b から S2 の commit のビルドのサイト）
#   AB_ENV（既定 なし）: ab-replay・hud-ab だけに渡す環境変数（短い確かめ用。例 AB_ENV="MISSION=us_02 SECS=20"＝どの組も us_02 の 1 件 20 秒になる）
#   JOBS（既定 2）
# SUMMARY の名前: 既定の状態は ab-all・hud-base …、ほかの状態は @audio・@noaudio を付ける（log も同じ名前）。art-perf は参考（門ではない）。
# 揺れの回し直し（v0.8.0 S5 の L62）: ab-all で違った件の組（log の same:false の行の先頭の語＝result・nodawn など）を同じ音の状態・JOBS=1 で回し直す。
#   違った件の行（最初の違いのフレームと欄）を SUMMARY にそのまま写す（自動で受け入れない＝ab-all の ✗ は残す）。
#   us04・us06 の組は違った件の行を SUMMARY に写すだけ（回し直しは人が JOBS=1 で）。
set -u
STAGE=${1:?stage}
cd /home/user/ww2-torpedo-boat
SP=/tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad
D=$SP/v0850/impl/$STAGE; mkdir -p $D
A=$SP/v0850/base-38acd73; B=$D/site
AUDIO_STATES=${AUDIO_STATES:-"default audio noaudio"}
SMALL_AUDIO_STATES=${SMALL_AUDIO_STATES:-"default"}
SKIP=" ${SKIP-art-perf} "
AB_ENV=${AB_ENV:-}
JOBS=${JOBS:-2}
SUM=$D/SUMMARY.txt; : > $SUM
ok(){ echo "✓ $1" >> $SUM; }; ng(){ echo "✗ $1" >> $SUM; }
skip(){ case "$SKIP" in *" $1 "*) echo "- $1 (SKIP)" >> $SUM; return 0;; esac; return 1; }
[ -d $A/assets ] || { ng "base site $A が無い（v0850/wt-38acd73 で VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=38acd73 npx vite build --outDir $A）"; echo ALL_DONE >> $SUM; echo ALL_DONE; exit 1; }
skip build || { rm -rf $B && VITE_BASE=/ww2-torpedo-boat/ VITE_BUILD_REF=main VITE_BUILD_SHA=38acd73 npx vite build --outDir $B > $D/build.log 2>&1 && ok build || ng build; }
skip typecheck || { npm run typecheck > $D/typecheck.log 2>&1 && ok typecheck || ng typecheck; }
skip lint || { npm run lint > $D/lint.log 2>&1 && ok lint || ng lint; }
skip test || { npm test > $D/test.log 2>&1 && ok "npm test $(grep -E 'Tests +[0-9]+ passed' $D/test.log | tail -1 | tr -s ' ')" || ng "npm test (see test.log)"; }
skip g2 || { G6=1 ALLY=1 EVAC=1 US04=${US04:-1} OUTDIR=$D/g2 bash scripts/headless/g2.sh > $D/g2.log 2>&1 && ok "g2 $(grep -o 'OK [0-9]* DIFF [0-9]*' $D/g2.log | tail -1)" || ng "g2 $(grep -o 'OK [0-9]* DIFF [0-9]*' $D/g2.log | tail -1)"; }
# 音の状態 → lib.mjs の環境変数
state_env(){ case "$1" in default) echo "";; audio) echo "AUDIO=1";; noaudio) echo "NOAUDIO=1";; *) echo "BAD_STATE=$1";; esac; }
abrun(){ # name tool set cam state
  local n=$1 t=$2 s=$3 c=$4 st=$5
  [ "$st" = default ] || n="$n@$st"
  env $(state_env $st) $AB_ENV A=$A B=$B SET=$s CAM=$c JOBS=$JOBS node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if echo "$line" | grep -q 'diff 0'; then ok "$n $line"; else ng "$n $line"; fi
}
if ! skip ab; then
  for st in $AUDIO_STATES; do abrun ab-all ab-replay all 1 $st; done
  for st in $SMALL_AUDIO_STATES; do abrun ab-jp04base ab-replay jp04base 1 $st; abrun ab-jp03 ab-replay jp03 1 $st; done
fi
if ! skip hud; then
  for st in $AUDIO_STATES; do abrun hud-base hud-ab base 0 $st; done
  for st in $SMALL_AUDIO_STATES; do abrun hud-jp04base hud-ab jp04base 0 $st; abrun hud-jp03 hud-ab jp03 0 $st; done
fi
# us_04 の組（A＝基準 0176202・濾しなし。NORADAR は A＝B＝今の木）: 名前 アプリ A B 足す環境変数（既定の音の状態だけ）
abrun04(){ # name tool A B env...
  local n=$1 t=$2 a=$3 b=$4; shift 4
  env $AB_ENV "$@" A=$a B=$b SET=us04 CAM=1 JOBS=$JOBS node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if echo "$line" | grep -q 'diff 0'; then ok "$n $line"; else ng "$n $line"; fi
  grep -E 'same:(true|false)' $D/$n.log | sed -E 's/^/    /' | cut -c1-260 >> $SUM
}
if ! skip us04; then
  abrun04 ab-us04 ab-replay $A $B
  abrun04 hud-us04 hud-ab $A $B
  abrun04 ab-us04-noradar ab-replay $B $B NORADAR=1
  abrun04 hud-us04-noradar hud-ab $B $B NORADAR=1
fi
# us_06 の組（v0.8.2: us_06 は基準 0176202 にある＝A＝基準・B＝今の木・濾しなし。SET=us06＝ノーマル・ハード × seed 1・2 を 200 秒。既定の音の状態だけ）
abrun06(){ # name tool A B
  local n=$1 t=$2 a=$3 b=$4
  env $AB_ENV A=$a B=$b SET=us06 CAM=1 JOBS=$JOBS node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if echo "$line" | grep -q 'diff 0'; then ok "$n $line"; else ng "$n $line"; fi
  grep -E 'same:(true|false)' $D/$n.log | sed -E 's/^/    /' | cut -c1-260 >> $SUM
}
if ! skip us06; then
  abrun06 ab-us06 ab-replay $A $B
  abrun06 hud-us06 hud-ab $A $B
fi
# us_05 の組（v0.8.2 S2。SET=us05＝ノーマル・ハード × seed 1・2 を 270 秒。既定の音の状態だけ）: S2 は A＝B＝今の木（決定性とページのエラー）・S2b から A05＝S2 の commit のビルド
abrun05(){ # name tool A B
  local n=$1 t=$2 a=$3 b=$4
  env $AB_ENV RECONUI=${RECONUI:-1} A=$a B=$b SET=us05 CAM=1 JOBS=$JOBS node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if echo "$line" | grep -q 'diff 0'; then ok "$n $line"; else ng "$n $line"; fi
  grep -E 'same:(true|false)' $D/$n.log | sed -E 's/^/    /' | cut -c1-260 >> $SUM
}
if ! skip us05; then
  A05=${A05:-$A}
  abrun05 ab-us05 ab-replay $A05 $B
  abrun05 hud-us05 hud-ab $A05 $B
fi
# us_07 の組（v0.8.5 S2。SET=us07＝ノーマル・ハード × seed 1・2 を 320 秒。既定の音の状態だけ。SKIP の名前 us07）: S2 は A＝B＝今の木（決定性とページのエラー）・S2 の後は A07＝S2 の commit のビルド
abrun07(){ # name tool A B
  local n=$1 t=$2 a=$3 b=$4
  env $AB_ENV A=$a B=$b SET=us07 CAM=1 JOBS=$JOBS node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if echo "$line" | grep -q 'diff 0' && ! grep -q 'page errors' $D/$n.log; then ok "$n $line"; else ng "$n $line"; fi
  grep -E 'same:(true|false)' $D/$n.log | sed -E 's/^/    /' | cut -c1-260 >> $SUM
}
if ! skip us07; then
  A07=${A07:-$B}
  abrun07 ab-us07 ab-replay $A07 $B
  abrun07 hud-us07 hud-ab $A07 $B
fi
# 史実モード（v0.8.4。SET=hist＝煙を使わない夜は基準と同じ・SET=histsmoke＝止まって煙幕を張る夜も v0.8.5 では基準と同じ＝基準に乱射がある）。SKIP の名前 hist
abrunh(){ # name tool set expect(same|diff)
  local n=$1 t=$2 st=$3 ex=$4
  env $AB_ENV A=$A B=$B SET=$st CAM=1 JOBS=$JOBS node scripts/headless/$t.mjs > $D/$n.log 2>&1
  local line; line=$(grep -E '^cases' $D/$n.log | tail -1)
  if [ "$ex" = same ]; then
    if echo "$line" | grep -q 'diff 0'; then ok "$n $line"; else ng "$n $line"; fi
  else
    if [ -n "$line" ] && ! echo "$line" | grep -q 'diff 0' && ! grep -q 'page errors' $D/$n.log; then ok "$n (違うはず) $line"; else ng "$n (違うはず) $line"; fi
  fi
  grep -E 'same:(true|false)' $D/$n.log | sed -E 's/^/    /' | cut -c1-300 >> $SUM
}
if ! skip hist; then
  abrunh ab-hist ab-replay hist same
  abrunh hud-hist hud-ab hist same
  abrunh ab-histsmoke ab-replay histsmoke same
  abrunh ab-smokeoff ab-replay smokeoff same
fi
# 既知の揺れ（v0.7.0 から）: nodawn/result の us_02 seed 1 の最後のフレームの .t。ab-all（どの状態でも）が ✗ なら、違った件の組を同じ状態で 1 本ずつ回し直す（v0.8.0 S5 の L62）
for st in $AUDIO_STATES; do
  n=ab-all; [ "$st" = default ] || n="ab-all@$st"
  if grep -q "^✗ $n " $SUM; then
    grep 'same:false' $D/$n.log | cut -c1-300 | sed -E "s/^/    differs ($n): /" >> $SUM
    for set in $(grep 'same:false' $D/$n.log | awk '{print $1}' | sort -u); do
      r=$D/ab-rerun-$set@$st.log
      env $(state_env $st) $AB_ENV A=$A B=$B SET=$set CAM=1 JOBS=1 node scripts/headless/ab-replay.mjs > $r 2>&1
      line=$(grep -E '^cases' $r | tail -1)
      echo "$line" | grep -q 'diff 0' && ok "$n rerun of $set (JOBS=1, same audio state; the ✗ above stays): $line" || ng "$n rerun of $set still differs (see $(basename $r))"
    done
  fi
done
skip tex-ab || { A=$A B=$B CHECK=1 JOBS=$JOBS OUT=$D/tex-ab.json node scripts/headless/tex-ab.mjs > $D/tex-ab.log 2>&1 && ok "tex-ab CHECK=1 $(grep -c '✗' $D/tex-ab.log) ✗ lines" || ng "tex-ab (see tex-ab.log)"; }
skip art-perf || { A=$A B=$B ROUNDS=2 OUT=$D/art-perf.json node scripts/headless/art-perf.mjs > $D/art-perf.log 2>&1 && ok "art-perf(参考) $(tail -1 $D/art-perf.log | cut -c1-80)" || ng "art-perf(参考。門ではない) $(tail -1 $D/art-perf.log | cut -c1-120)"; }
skip snapshots || {
  snaps=$(git -C /home/user/ww2-torpedo-boat status --porcelain --untracked-files=all -- tests/__snapshots__ 2>/dev/null | tr -s ' ' | tr '\n' ';')
  [ -z "$snaps" ] && ok "snapshots untouched" || ng "snapshots changed: $snaps"
}
echo ALL_DONE >> $SUM; echo ALL_DONE
