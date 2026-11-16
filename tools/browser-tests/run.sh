#!/bin/sh
# Browser tests for Fudge's Snowball Showdown: real headless Chrome, real mouse and touch events, three windows playing each other over WebRTC.
# Needs macOS with Google Chrome and node. Screenshots go to $OUT (default: a temp folder) so you can look at them.
#   tools/browser-tests/run.sh            run everything
# Run `swiftc -O -o /tmp/decode-qr tools/browser-tests/decode-qr.swift` once, then `/tmp/decode-qr some-screenshot.png`, to read a QR code the way a phone does.
cd "$(dirname "$0")/../.." || exit 1
OUT="${OUT:-${TMPDIR:-/tmp}/fss-shots}"
mkdir -p "$OUT"
python3 -m http.server 8790 --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
status=0
for t in practice_test phone_test answer_qr multi_test; do
  echo "== $t"
  node "tools/browser-tests/$t.mjs" "$OUT" || status=1
done
echo "screenshots: $OUT"
exit $status
