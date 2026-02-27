const store = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function secureEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const auth = {
  async requestOTP(phone) {
    const lockouts = store.read('lockouts', {});
    if (Date.now() < (lockouts[phone] || 0)) return null;

    const otp = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    const records = store.read('otpRecords', {});
    records[phone] = { hash: await sha256Hex(otp), exp: Date.now() + 120000, attempts: 0 };
    store.write('otpRecords', records);
    return otp;
  },

  async verifyOTP(phone, code) {
    const lockouts = store.read('lockouts', {});
    if (Date.now() < (lockouts[phone] || 0)) return false;

    const records = store.read('otpRecords', {});
    const rec = records[phone];
    if (!rec || Date.now() > rec.exp) {
      delete records[phone];
      store.write('otpRecords', records);
      return false;
    }

    const candidate = await sha256Hex(code);
    if (secureEqual(rec.hash, candidate)) {
      delete records[phone];
      store.write('otpRecords', records);
      return true;
    }

    rec.attempts += 1;
    if (rec.attempts >= 5) {
      delete records[phone];
      lockouts[phone] = Date.now() + 300000;
      store.write('lockouts', lockouts);
    } else {
      records[phone] = rec;
    }
    store.write('otpRecords', records);
    return false;
  }
};

const db = {
  users: store.read('users', []),
  chats: store.read('chats', []),
  envelopes: store.read('envelopes', []),
  telemetry: store.read('telemetry', [
    { ts: Date.now() - 3600e3, sent: 18000, recv: 12000, active: 75 },
    { ts: Date.now() - 1800e3, sent: 22000, recv: 17000, active: 98 },
    { ts: Date.now(), sent: 30000, recv: 28000, active: 130 }
  ]),
  keys: store.read('keys', {})
};

if (db.users.length === 0) {
  db.users = [
    { id: crypto.randomUUID(), phone: '+14155550101', name: 'Alice', region: 'SF' },
    { id: crypto.randomUUID(), phone: '+14155550102', name: 'Bob', region: 'NY' }
  ];
}

function persist() { ['users', 'chats', 'envelopes', 'telemetry', 'keys'].forEach(k => store.write(k, db[k])); }

async function ensureUserKeys(userId) {
  if (db.keys[userId]) return db.keys[userId];

  const ecdh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const sign = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  db.keys[userId] = {
    ecdhPriv: await crypto.subtle.exportKey('jwk', ecdh.privateKey),
    ecdhPub: await crypto.subtle.exportKey('jwk', ecdh.publicKey),
    signPriv: await crypto.subtle.exportKey('jwk', sign.privateKey),
    signPub: await crypto.subtle.exportKey('jwk', sign.publicKey)
  };
  persist();
  return db.keys[userId];
}

async function deriveChatKey(senderId, recipientId) {
  const sender = await ensureUserKeys(senderId);
  const recipient = await ensureUserKeys(recipientId);
  const sPriv = await crypto.subtle.importKey('jwk', sender.ecdhPriv, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const rPub = await crypto.subtle.importKey('jwk', recipient.ecdhPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: rPub }, sPriv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function ub64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
function concatBytes(a, b) { const out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; }

async function encryptAndSign(chatId, senderId, recipientId, plaintext) {
  const key = await deriveChatKey(senderId, recipientId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`${chatId}|${senderId}|${recipientId}|v1`);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, new TextEncoder().encode(plaintext));

  const senderKeys = await ensureUserKeys(senderId);
  const signPriv = await crypto.subtle.importKey('jwk', senderKeys.signPriv, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signPriv, concatBytes(aad, new Uint8Array(ciphertext)));

  return {
    id: crypto.randomUUID(),
    chatId,
    senderId,
    recipientId,
    protocolVersion: 1,
    senderSigningPublicKey: senderKeys.signPub,
    ciphertext: b64(ciphertext),
    iv: b64(iv),
    signature: b64(signature),
    sentAt: Date.now()
  };
}

async function decryptEnvelope(envelope, viewerId) {
  const peerId = envelope.senderId === viewerId ? envelope.recipientId : envelope.senderId;
  const key = await deriveChatKey(viewerId, peerId);
  const aad = new TextEncoder().encode(`${envelope.chatId}|${envelope.senderId}|${envelope.recipientId}|v1`);

  const verifyKey = await crypto.subtle.importKey('jwk', envelope.senderSigningPublicKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const ciphertext = ub64(envelope.ciphertext);
  const signatureOk = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, ub64(envelope.signature), concatBytes(aad, ciphertext));
  if (!signatureOk) return null;

  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(envelope.iv), additionalData: aad }, key, ciphertext);
  return { ...envelope, text: new TextDecoder().decode(plain) };
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function findOrCreateChat(userA, userB) {
  let c = db.chats.find(x => x.participants.includes(userA) && x.participants.includes(userB) && x.participants.length === 2);
  if (!c) {
    c = { id: crypto.randomUUID(), participants: [userA, userB], title: 'Direct Chat', lastMessageAt: null };
    db.chats.push(c);
    persist();
  }
  return c;
}

let state = { auth: { status: 'loggedOut', err: '' }, user: null, tab: 'chats', selectedChat: null };

function render() {
  const root = document.getElementById('app');
  if (state.auth.status !== 'authenticated') return renderLogin(root);
  return renderMain(root);
}

function renderLogin(root) {
  root.innerHTML = `<div class="card"><h2>SecureMessenger Web</h2>
    <div class="small">WhatsApp-like local-only messenger: MFA + P2P encryption + dashboard</div>
    ${state.auth.err ? `<p style="color:#f87171">${state.auth.err}</p>` : ''}
    <input id="phone" placeholder="+1..." value="+1" />
    <button id="sendOtp">Send OTP</button>
    <div id="otpWrap"></div></div>`;

  document.getElementById('sendOtp').onclick = async () => {
    const phone = document.getElementById('phone').value.trim();
    const otp = await auth.requestOTP(phone);
    if (!otp) {
      state.auth = { status: 'loggedOut', err: 'Too many attempts. Try later.' };
      return render();
    }
    document.getElementById('otpWrap').innerHTML = `<p>Dev OTP: <b>${otp}</b></p><input id="otp" placeholder="OTP" /><button id="verify">Verify MFA</button>`;
    document.getElementById('verify').onclick = async () => {
      const ok = await auth.verifyOTP(phone, document.getElementById('otp').value.trim());
      if (!ok) {
        state.auth = { status: 'loggedOut', err: 'Invalid, expired, or locked OTP.' };
        return render();
      }
      let user = db.users.find(u => u.phone === phone);
      if (!user) {
        user = { id: crypto.randomUUID(), phone, name: `User ${phone.slice(-4)}`, region: 'Unknown' };
        db.users.push(user);
      }
      await ensureUserKeys(user.id);
      const peer = db.users.find(u => u.id !== user.id);
      if (peer) findOrCreateChat(user.id, peer.id);
      persist();
      state = { ...state, auth: { status: 'authenticated' }, user, selectedChat: db.chats[0]?.id || null };
      render();
    };
  };
}

async function renderMain(root) {
  root.innerHTML = `<div class="tabs">
      <button class="tab ${state.tab === 'chats' ? 'active' : ''}" id="tabChats">Chats</button>
      <button class="tab ${state.tab === 'dashboard' ? 'active' : ''}" id="tabDash">Dashboard</button>
      <button class="tab" id="tabLogout">Logout</button>
    </div><div id="view"></div>`;

  document.getElementById('tabChats').onclick = () => { state.tab = 'chats'; render(); };
  document.getElementById('tabDash').onclick = () => { state.tab = 'dashboard'; render(); };
  document.getElementById('tabLogout').onclick = () => { state = { auth: { status: 'loggedOut', err: '' }, user: null, tab: 'chats', selectedChat: null }; render(); };

  const view = document.getElementById('view');
  if (state.tab === 'dashboard') return renderDashboard(view);

  const myChats = db.chats.filter(c => c.participants.includes(state.user.id));
  const selectedChat = myChats.find(c => c.id === state.selectedChat) || myChats[0];
  if (selectedChat) state.selectedChat = selectedChat.id;

  const peer = selectedChat ? db.users.find(u => u.id === selectedChat.participants.find(p => p !== state.user.id)) : null;
  const envelopes = selectedChat ? db.envelopes.filter(e => e.chatId === selectedChat.id) : [];
  const decrypted = (await Promise.all(envelopes.map(e => decryptEnvelope(e, state.user.id)))).filter(Boolean);

  view.innerHTML = `<div class="grid grid-2">
    <div class="card"><h3>Chats</h3>${myChats.map(c => `<div><button data-chat="${c.id}">${c.title}</button></div>`).join('')}</div>
    <div class="card"><h3>${peer ? `Chat with ${peer.name}` : 'No chat selected'}</h3>
      <div class="messages">${decrypted.map(m => `<div class="msg ${m.senderId === state.user.id ? 'mine' : 'theirs'}">${escapeHtml(m.text)}</div>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><input id="draft" placeholder="Type message" style="flex:1" /><button id="send">Send</button></div>
    </div></div>`;

  document.querySelectorAll('[data-chat]').forEach(el => el.onclick = () => { state.selectedChat = el.dataset.chat; render(); });
  const send = document.getElementById('send');
  if (send) send.onclick = async () => {
    const text = document.getElementById('draft').value.trim();
    if (!text || !selectedChat || !peer) return;
    const env = await encryptAndSign(selectedChat.id, state.user.id, peer.id, text);
    db.envelopes.push(env);
    db.telemetry.push({ ts: Date.now(), sent: text.length, recv: text.length, active: db.users.length });
    selectedChat.lastMessageAt = Date.now();
    persist();
    render();
  };
}

function project(lat, lon, w, h) { return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h]; }

function renderDashboard(root) {
  const totalSent = db.telemetry.reduce((s, t) => s + t.sent, 0);
  const totalRecv = db.telemetry.reduce((s, t) => s + t.recv, 0);
  const peak = Math.max(...db.telemetry.map(t => t.active), 0);

  const regions = [
    { region: 'SF', count: 120, lat: 37.7749, lon: -122.4194 },
    { region: 'NY', count: 200, lat: 40.7128, lon: -74.006 },
    { region: 'LDN', count: 160, lat: 51.5074, lon: -0.1278 }
  ];

  root.innerHTML = `<div class="card"><h3>Traffic & Usage Dashboard</h3>
    <div class="metrics"><div class="card">Sent<br><b>${totalSent}</b></div><div class="card">Received<br><b>${totalRecv}</b></div><div class="card">Peak Active<br><b>${peak}</b></div></div>
    <h4>Telemetry</h4>
    <div>${db.telemetry.slice(-10).reverse().map(t => `<div class="small">${new Date(t.ts).toLocaleString()} | sent:${t.sent} recv:${t.recv} active:${t.active}</div>`).join('')}</div>
    <h4>User Count Map</h4><div id="map" class="map"></div></div>`;

  const map = document.getElementById('map');
  regions.forEach(r => {
    const [x, y] = project(r.lat, r.lon, map.clientWidth, map.clientHeight);
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = `${r.region}: ${r.count}`;
    dot.appendChild(badge);
    map.appendChild(dot);
  });
}

render();
