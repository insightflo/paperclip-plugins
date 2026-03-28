#!/usr/bin/env python3
"""
Telegram 메시지 전송 CLI wrapper.
Usage: python3 send_telegram_wrapper.py "메시지 내용"
       python3 send_telegram_wrapper.py --file report.md
       echo "메시지" | python3 send_telegram_wrapper.py --stdin
"""
import sys
import os
import json
import urllib.request

# 스크립트와 같은 디렉토리의 .env 로드
_env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_env_file):
    with open(_env_file, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _, _v = _line.partition("=")
            _k = _k.strip()
            _v = _v.strip().strip('"').strip("'")
            if _k and _k not in os.environ:
                os.environ[_k] = _v

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


def send_telegram_message(text, chat_id=None, token=None):
    chat_id = chat_id or TELEGRAM_CHAT_ID
    token = token or TELEGRAM_BOT_TOKEN
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main():
    if len(sys.argv) < 2 and not sys.stdin.isatty():
        message = sys.stdin.read().strip()
    elif "--file" in sys.argv:
        idx = sys.argv.index("--file")
        filepath = sys.argv[idx + 1]
        with open(filepath) as f:
            message = f.read().strip()
    elif "--stdin" in sys.argv:
        message = sys.stdin.read().strip()
    else:
        message = " ".join(sys.argv[1:])

    if not message:
        print(json.dumps({"success": False, "error": "empty message"}))
        sys.exit(1)

    try:
        result = send_telegram_message(message)
        print(json.dumps({"success": True, "message_id": result.get("result", {}).get("message_id")}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
