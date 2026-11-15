// Connections between players. The room's host is the hub: every other player holds one
// peer-to-peer WebRTC link to the host, with two data channels:
//   reliable   (ordered JSON)             lobby, race start, timing data
//   fast       (unordered, never resent)  car positions, 30 times a second
// Browsers need a meeting point to find each other. That is the only thing a server is used for:
// the public PeerJS broker passes the connection offer and answer between two browsers and then
// drops out. No game data goes through it.
// For tests there is a second transport that only reaches other tabs of the same browser
// (BroadcastChannel, ?net=local): no network involved at all.
const BROKER = 'wss://0.peerjs.com/peerjs?key=peerjs';
// STUN servers tell a browser its public address so two players can connect directly. There is no
// relay (TURN) server: no free public one works any more, so two players who are both behind
// strict firewalls cannot connect. To add one, put { urls: 'turn:…', username, credential } here.
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }] };
const PREFIX = 'agp1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const rnd = (n) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
export const newCode = () => rnd(5);
const local = () => new URLSearchParams(location.search).get('net') === 'local';
// ?netdebug=1 logs each step of making a connection to the browser console
const dbg = (...a) => { if (/[?&]netdebug=1/.test(location.search)) console.log('[net]', ...a); };

// One connected player, as seen from this machine.
class Link {
  constructor() { this.open = false; this.onmsg = null; this.onfast = null; this.onclose = null; this.closed = false; }
  _up() { this.open = true; }
  _down() { if (this.closed) return; this.closed = true; this.open = false; this.onclose?.(); }
}

// ------------------------------------------------------------------ WebRTC
class Broker {
  constructor(id) {
    this.id = id; this.on = {}; this.dead = false;
    this.ready = new Promise((ok, fail) => {
      const token = Math.random().toString(36).slice(2);
      let ws;
      try { ws = this.ws = new WebSocket(`${BROKER}&id=${id}&token=${token}&version=1.5.4`); } catch (e) { fail(new Error('offline')); return; }
      const timer = setTimeout(() => fail(new Error('offline')), 12000);
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        dbg('broker >', m.type, m.src || '');
        if (m.type === 'OPEN') { clearTimeout(timer); this.beat = setInterval(() => { if (ws.readyState === 1) ws.send('{"type":"HEARTBEAT"}'); }, 5000); ok(); }
        else if (m.type === 'ID-TAKEN') { clearTimeout(timer); fail(new Error('taken')); }
        else if (m.type === 'ERROR' || m.type === 'INVALID-KEY') { clearTimeout(timer); fail(new Error('offline')); }
        else this.on[m.type]?.(m.src, m.payload);
      };
      ws.onerror = () => { clearTimeout(timer); fail(new Error('offline')); };
      ws.onclose = () => { clearInterval(this.beat); if (!this.dead) this.on.CLOSED?.(); };
    });
  }
  send(type, dst, payload) { dbg('broker <', type, dst, this.ws?.readyState); if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type, dst, payload })); }
  close() { this.dead = true; clearInterval(this.beat); try { this.ws?.close(); } catch (e) { /* already closed */ } }
}

class RtcLink extends Link {
  constructor(pc) {
    super();
    this.pc = pc; this.r = null; this.u = null;
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      dbg('connection', s);
      if (s === 'failed' || s === 'closed') this._down();
      // a dropped connection sometimes recovers by itself: give it a few seconds
      if (s === 'disconnected') { clearTimeout(this.dropT); this.dropT = setTimeout(() => { if (pc.connectionState !== 'connected') this.close(); }, 6000); }
    };
  }
  _channel(ch) {
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'r') { this.r = ch; ch.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onmsg?.(m); }; ch.onclose = () => this._down(); }
    else { this.u = ch; ch.onmessage = (ev) => { if (ev.data instanceof ArrayBuffer) this.onfast?.(ev.data); }; }
    dbg('channel', ch.label, ch.readyState);
    const up = () => { if (this.r?.readyState === 'open' && this.u?.readyState === 'open' && !this.open) { this._up(); this.onopen?.(); } };
    ch.onopen = up; up();
  }
  send(obj) { if (this.r?.readyState === 'open') { try { this.r.send(JSON.stringify(obj)); } catch (e) { /* closing */ } } }
  // positions are only worth sending fresh: when the line is backed up, skip a beat
  fast(buf) { if (this.u?.readyState === 'open' && this.u.bufferedAmount < 32768) { try { this.u.send(buf); } catch (e) { /* closing */ } } }
  close() { clearTimeout(this.dropT); try { this.pc.close(); } catch (e) { /* closed */ } this._down(); }
}

// The broker only passes on messages shaped exactly like the PeerJS client's own, so ours are.
function trickle(pc, broker, peer, connectionId) {
  pc.onicecandidate = (ev) => {
    const c = ev.candidate;
    if (c && c.candidate) broker.send('CANDIDATE', peer, { candidate: { candidate: c.candidate, sdpMLineIndex: c.sdpMLineIndex, sdpMid: c.sdpMid }, type: 'data', connectionId });
  };
}
const desc = (d) => ({ type: d.type, sdp: d.sdp });

// Host side: listen on the room code for players' offers. onlink(link) is called for each player
// whose channels have opened. Returns { code, close() }.
async function rtcHost(code, onlink) {
  let broker = null;
  for (let tries = 0; tries < 4 && !broker; tries++) {
    const b = new Broker(PREFIX + code);
    try { await b.ready; broker = b; } catch (e) { b.close(); if (e.message !== 'taken') throw e; code = newCode(); }
  }
  if (!broker) throw new Error('offline');
  const peers = new Map();
  broker.on.OFFER = async (src, p) => {
    if (!p?.sdp || peers.has(src)) return;
    const pc = new RTCPeerConnection(ICE), link = new RtcLink(pc);
    peers.set(src, { pc, pending: [] });
    link.onopen = () => onlink(link);
    const gone = link._down.bind(link); link._down = () => { peers.delete(src); gone(); };
    pc.ondatachannel = (ev) => link._channel(ev.channel);
    trickle(pc, broker, src, p.connectionId);
    try {
      await pc.setRemoteDescription(p.sdp);
      const st = peers.get(src); if (st) { for (const c of st.pending) pc.addIceCandidate(c).catch(() => {}); st.pending = null; }
      await pc.setLocalDescription(await pc.createAnswer());
      broker.send('ANSWER', src, { sdp: desc(pc.localDescription), type: 'data', connectionId: p.connectionId, browser: 'chrome' });
    } catch (e) { link.close(); }
  };
  broker.on.CANDIDATE = (src, p) => {
    const st = peers.get(src); if (!st || !p?.candidate) return;
    if (st.pending) st.pending.push(p.candidate); else st.pc.addIceCandidate(p.candidate).catch(() => {});
  };
  // the meeting point dropping out does not hurt players who are already connected; reconnect so
  // that late arrivals can still find the room
  broker.on.CLOSED = () => { if (!api.closed) setTimeout(() => { if (api.closed) return; const b = new Broker(PREFIX + code); b.on = broker.on; b.ready.then(() => { broker = b; }, () => b.on.CLOSED?.()); }, 3000); };
  const api = { code, closed: false, close() { api.closed = true; broker.close(); } };
  return api;
}

// Player side: connect to the room's host. Resolves with the open link.
function rtcJoin(code) {
  return new Promise((ok, fail) => {
    const me = PREFIX + rnd(12).toLowerCase(), host = PREFIX + code, connId = 'dc_' + rnd(10).toLowerCase();
    const broker = new Broker(me);
    const pc = new RTCPeerConnection(ICE), link = new RtcLink(pc);
    let done = false, pending = [];
    const end = (err) => { if (done) return; done = true; clearTimeout(timer); broker.close(); if (err) { try { pc.close(); } catch (e) { /* closed */ } fail(err); } else ok(link); };
    const timer = setTimeout(() => end(new Error('timeout')), 25000);
    link.onopen = () => end();
    link.onclose = () => end(new Error('blocked'));
    broker.on.ANSWER = async (src, p) => {
      if (src !== host || !p?.sdp) return;
      try { await pc.setRemoteDescription(p.sdp); for (const c of pending) pc.addIceCandidate(c).catch(() => {}); pending = null; } catch (e) { end(new Error('blocked')); }
    };
    broker.on.CANDIDATE = (src, p) => { if (src !== host || !p?.candidate) return; if (pending) pending.push(p.candidate); else pc.addIceCandidate(p.candidate).catch(() => {}); };
    broker.on.EXPIRE = () => end(new Error('noroom')); // nobody is listening on that code
    broker.on.LEAVE = () => end(new Error('noroom'));
    broker.ready.then(async () => {
      link._channel(pc.createDataChannel('r'));
      link._channel(pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
      trickle(pc, broker, host, connId);
      await pc.setLocalDescription(await pc.createOffer());
      broker.send('OFFER', host, { sdp: desc(pc.localDescription), type: 'data', connectionId: connId, label: connId, reliable: false, serialization: 'binary', browser: 'chrome' });
    }).catch((e) => end(e instanceof Error ? e : new Error('offline')));
  });
}

// ------------------------------------------------------------------ same-browser test transport
class TabLink extends Link {
  constructor(bc, me, peer) { super(); this.bc = bc; this.me = me; this.peer = peer; this._up(); }
  send(obj) { if (this.open) this.bc.postMessage({ to: this.peer, from: this.me, k: 'r', d: obj }); }
  fast(buf) { if (this.open) this.bc.postMessage({ to: this.peer, from: this.me, k: 'u', d: buf }); }
  close() { if (this.open) this.bc.postMessage({ to: this.peer, from: this.me, k: 'bye' }); this._down(); }
  _in(m) { if (m.k === 'r') this.onmsg?.(m.d); else if (m.k === 'u') this.onfast?.(m.d); else if (m.k === 'bye') this._down(); }
}

function tabHost(code, onlink) {
  const bc = new BroadcastChannel('agp-room-' + code), links = new Map();
  bc.onmessage = (ev) => {
    const m = ev.data;
    if (m.to !== 'host') return;
    if (m.k === 'join') { const l = new TabLink(bc, 'host', m.from); links.set(m.from, l); bc.postMessage({ to: m.from, from: 'host', k: 'ok' }); onlink(l); }
    else links.get(m.from)?._in(m);
  };
  addEventListener('pagehide', () => { for (const l of links.values()) l.close(); });
  return { code, close() { bc.close(); } };
}

function tabJoin(code) {
  return new Promise((ok, fail) => {
    const bc = new BroadcastChannel('agp-room-' + code), me = 'p' + rnd(8);
    let link = null;
    const timer = setTimeout(() => { bc.close(); fail(new Error('noroom')); }, 2500);
    bc.onmessage = (ev) => {
      const m = ev.data;
      if (m.to !== me) return;
      if (m.k === 'ok') { clearTimeout(timer); link = new TabLink(bc, me, 'host'); ok(link); } else link?._in(m);
    };
    addEventListener('pagehide', () => link?.close());
    bc.postMessage({ to: 'host', from: me, k: 'join' });
  });
}

// ------------------------------------------------------------------ public
export const supported = () => (local() ? typeof BroadcastChannel !== 'undefined' : typeof RTCPeerConnection !== 'undefined' && typeof WebSocket !== 'undefined');
export const hostRoom = (code, onlink) => (local() ? Promise.resolve(tabHost(code, onlink)) : rtcHost(code, onlink));
export const joinRoom = (code) => (local() ? tabJoin(code) : rtcJoin(code));
