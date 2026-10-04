#!/bin/bash
# Claude Code のクラウドセッション開始時に依存をインストールする。
# ローカル（PC）では何もしない。CLAUDE_CODE_REMOTE=true はクラウドVMだけが持つ。

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

if [ -f package.json ]; then
  if [ -f package-lock.json ]; then
    npm ci || npm install
  else
    npm install
  fi
fi

exit 0
