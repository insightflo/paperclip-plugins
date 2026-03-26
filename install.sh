#!/bin/bash
# Paperclip Plugins 설치 스크립트
# Usage: ./install.sh [API_BASE]
# Example: ./install.sh http://localhost:3100

API="${1:-http://localhost:3100}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

PLUGINS=(knowledge-base system-garden tool-registry work-board workflow-engine)

echo "Paperclip Plugins 설치"
echo "API: $API"
echo ""

for plugin in "${PLUGINS[@]}"; do
  echo "→ $plugin 설치 중..."
  if paperclipai plugin install --api-base "$API" "$SCRIPT_DIR/$plugin" 2>&1; then
    echo "  ✅ $plugin 완료"
  else
    echo "  ❌ $plugin 실패"
  fi
  echo ""
done

echo "설치 완료."
