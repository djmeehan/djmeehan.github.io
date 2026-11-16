# Browser tests

Drive a real headless Chrome (macOS, `/Applications/Google Chrome.app`) over the DevTools protocol. Not part of `tools/check.py`
(they need a browser); run them with `tools/browser-tests/run.sh` after changing a game's pages.

- `practice_test`: menus, name and character choice, practice game, zoom (button, wheel), mouse slingshot.
- `phone_test`: a phone-sized touch screen: two-finger pinch zoom, thumb slingshot, taps do not throw.
- `answer_qr`: the joiner's answer code fits on a phone screen (screenshot is saved so it can be decoded).
- `multi_test`: host plus two friends in three windows over real WebRTC: join links, names, character conflicts, a whole round,
  everyone seeing the same city and spirit, the next round, and a friend dropping out (the computer takes over).
- `decode-qr.swift`: reads QR codes from a screenshot with macOS's own barcode reader, to prove a phone camera can read the game's codes.

Each tab gets its own window because hidden tabs stop animating (a real phone's foreground game never does).
