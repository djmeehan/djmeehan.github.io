// Squeezes a WebRTC session description (the "offer" or "answer" two phones swap to connect) down to a couple of hundred characters so it
// fits in a QR code or a short link, and rebuilds a full description from it. Only what a data-channel connection needs is kept:
// the ICE username and password, the DTLS fingerprint and a few local network addresses.
//
//   Signal.pack({ kind: 'o' | 'a', room, slot, sdp })  ->  short URL-safe string
//   Signal.unpack(string)                              ->  { kind, room, slot, sdp }
(function (root) {
  'use strict';

  const CAND = /^a=candidate:\S+ \d+ udp \d+ (\S+) (\d+) typ host\b/i;

  function b64urlEncode(str) {
    const bytes = unescape(encodeURIComponent(str));
    const b64 = typeof btoa === 'function' ? btoa(bytes) : Buffer.from(bytes, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    return decodeURIComponent(escape(bin));
  }
  const hexToB64url = hex => {
    const bytes = hex.split(':').map(h => parseInt(h, 16));
    const bin = String.fromCharCode.apply(null, bytes);
    return (typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const b64urlToHex = s => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    return Array.from(bin, c => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(':');
  };

  function pack(o) {
    const lines = o.sdp.split(/\r?\n/);
    const get = re => { for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); } return null; };
    const ufrag = get(/^a=ice-ufrag:(.+)$/), pwd = get(/^a=ice-pwd:(.+)$/), fp = get(/^a=fingerprint:sha-256 (.+)$/i);
    if (!ufrag || !pwd || !fp) throw new Error('description has no ICE credentials or fingerprint');
    const cands = [];
    for (const l of lines) {
      const m = l.match(CAND);
      if (m && cands.length < 4 && !cands.some(c => c[0] === m[1] && c[1] === +m[2])) cands.push([m[1], +m[2]]);
    }
    cands.sort((a, b) => (a[0].includes(':') ? 1 : 0) - (b[0].includes(':') ? 1 : 0));   // IPv4 and .local names first
    if (!cands.length) throw new Error('description has no usable network address');
    return b64urlEncode(JSON.stringify([o.kind, o.room, o.slot, ufrag, pwd, hexToB64url(fp), cands.map(c => c[0] + '|' + c[1])]));
  }

  function unpack(str) {
    const [kind, room, slot, ufrag, pwd, fp, cands] = JSON.parse(b64urlDecode(str));
    if ((kind !== 'o' && kind !== 'a') || !ufrag || !pwd || !fp || !Array.isArray(cands)) throw new Error('not a valid game code');
    const sdp = [
      'v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:' + ufrag, 'a=ice-pwd:' + pwd, 'a=ice-options:trickle',
      'a=fingerprint:sha-256 ' + b64urlToHex(fp),
      'a=setup:' + (kind === 'o' ? 'actpass' : 'active'),
      'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144',
    ];
    cands.forEach((c, i) => {
      const [ip, port] = c.split('|');
      sdp.push('a=candidate:' + (i + 1) + ' 1 udp ' + (2113937151 - i * 256) + ' ' + ip + ' ' + port + ' typ host');
    });
    sdp.push('a=end-of-candidates');
    return { kind, room, slot, sdp: sdp.join('\r\n') + '\r\n' };
  }

  const api = { pack, unpack };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Signal = api;
})(typeof window !== 'undefined' ? window : globalThis);
