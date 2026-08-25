#!/usr/bin/env bash
# trio.sh - 三窗口布局(tmux 版):ARCH / DEV / TESTER 三个垂直 pane,30/35/35
#
# 用法:  ./launch/trio.sh [项目根目录]     (默认当前目录)
# 平台:  Linux / WSL / macOS(需要 tmux;WSL 建议在 Windows Terminal 里跑)
# 对应:  Windows 版 launch/trio.ps1(功能对齐:Root 参数 / anti-dup / 布局比例)

set -euo pipefail

ROOT="${1:-$(pwd)}"
ROOT="$(cd "$ROOT" 2>/dev/null && pwd)" || { echo "目录不存在: $1"; exit 1; }
SESSION="wf-trio"

# 前置检查
if ! command -v tmux >/dev/null 2>&1; then
  echo "需要 tmux: Debian/Ubuntu: sudo apt install tmux  |  macOS: brew install tmux"
  exit 1
fi

# Anti-dup(对应 trio.ps1 的 Get-CimInstance 检查):已有 >=3 个 WF_ROLE 进程即拒绝
running=$(pgrep -f "WF_ROLE=(arch|dev|tester)" 2>/dev/null | wc -l | tr -d ' ' || true)
if [ "$running" -ge 3 ]; then
  echo "已有一个 work-flow trio 在跑($running 个角色进程)。"
  echo "先关掉旧窗口;或 attach 到已有 session: tmux attach -t $SESSION"
  exit 1
fi

# 幂等:session 已存在则直接 attach
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "session $SESSION 已存在,attach..."
  tmux attach -t "$SESSION"
  exit 0
fi

# 启动一个 pane:设置终端标题 → cd 项目根 → 以角色启动 pi
start_pane() {  # $1=WF_ROLE $2=标题
  tmux send-keys -t "$SESSION" "cd '$ROOT' && printf '\\033]0;$2\\007' && WF_ROLE=$1 pi" Enter
}

tmux new-session -d -s "$SESSION"
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format '#{pane_index} #{pane_title}'
tmux set-option -t "$SESSION" status off

# 垂直三格 30/35/35:ARCH 100% → -p 70 分出 DEV(70%) → -p 50 平分出 TESTER
tmux select-pane -t "$SESSION" -T "ARCH"
start_pane arch ARCH

tmux split-window -t "$SESSION" -v -p 70
tmux select-pane -t "$SESSION" -T "DEV"
start_pane dev DEV

tmux split-window -t "$SESSION" -v -p 50
tmux select-pane -t "$SESSION" -T "TESTER"
start_pane tester TESTER

tmux select-pane -t "$SESSION:0.0"
tmux attach -t "$SESSION"
