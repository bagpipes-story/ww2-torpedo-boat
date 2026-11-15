#!/usr/bin/env bash
# 2 つのビルドの dist がバイト同一かを見る: dist-same.sh <site A> <site B>。ファイル名と sha256 の一覧を比べ、違えば差を出して 1 で終わる。
set -u
A=${1:?site A}; B=${2:?site B}
la=$(cd "$A" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
lb=$(cd "$B" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
if [ "$la" = "$lb" ]; then echo "dist same: $(echo "$la" | wc -l) files"; exit 0; fi
echo "dist differs:"; diff <(echo "$la") <(echo "$lb") | head -20; exit 1
