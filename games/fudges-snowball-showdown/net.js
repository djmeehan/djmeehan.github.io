// Phone-to-phone connections for Fudge's Snowball Showdown. Each Link is one WebRTC data channel between two phones. There is no game server:
// the two phones introduce themselves by swapping a short "offer" and "answer" (as QR codes or links, see signal.js), then talk directly.
//
//   host:   const offer = await link.makeOffer(room, slot);  ... show it ...  await link.acceptAnswer(answerString);
//   guest:  const { packed } = await link.answerOffer(offerString);  ... show it ...
//   both:   link.onopen / link.onmessage(obj) / link.onclose / link.send(obj)
// No STUN or TURN server is used, so it works between phones on the same Wi-Fi (the usual way to play around a table).
(function (root) {
  'use strict';

  const waitForIce = (pc, ms) => new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve(); } };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, ms || 3000);
  });

  class Link {
    constructor() {
      this.pc = null; this.dc = null; this.open = false;
      this.onopen = () => {}; this.onclose = () => {}; this.onmessage = () => {}; this.onstate = () => {};
    }
    _wire(dc) {
      this.dc = dc;
      dc.onopen = () => { this.open = true; this.onopen(); };
      dc.onclose = () => { const was = this.open; this.open = false; if (was) this.onclose(); };
      dc.onmessage = e => { let msg; try { msg = JSON.parse(e.data); } catch (err) { return; } this.onmessage(msg); };
    }
    _pc() {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.onconnectionstatechange = () => {
        this.onstate(pc.connectionState);
        if ((pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') && this.open) { this.open = false; this.onclose(); }
      };
      this.pc = pc;
      return pc;
    }
    async makeOffer(room, slot) {
      const pc = this._pc();
      this._wire(pc.createDataChannel('game'));
      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      return root.Signal.pack({ kind: 'o', room, slot, sdp: pc.localDescription.sdp });
    }
    async acceptAnswer(packed) {
      const a = root.Signal.unpack(packed);
      if (a.kind !== 'a') throw new Error('that is a join code, not an answer');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: a.sdp });
      return a;
    }
    async answerOffer(packed) {
      const o = root.Signal.unpack(packed);
      if (o.kind !== 'o') throw new Error('that is an answer, not a join code');
      const pc = this._pc();
      pc.ondatachannel = e => this._wire(e.channel);
      await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIce(pc);
      return { room: o.room, slot: o.slot, packed: root.Signal.pack({ kind: 'a', room: o.room, slot: o.slot, sdp: pc.localDescription.sdp }) };
    }
    send(obj) {
      if (!this.open) return false;
      try { this.dc.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    }
    close() {
      this.open = false;
      try { if (this.dc) this.dc.close(); } catch (e) { /* already closed */ }
      try { if (this.pc) this.pc.close(); } catch (e) { /* already closed */ }
    }
  }

  const api = { Link };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Net = api;
})(typeof window !== 'undefined' ? window : globalThis);
