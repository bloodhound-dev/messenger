const store = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

const SECURITY_POLICY = {
  otpTTLms: 120_000,
  otpMaxAttempts: 5,
  otpLockoutMs: 300_000,
  protocolVersion: 2,
  keyRotationDays: 30
};

async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function secureEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const db = {
  users: store.read('users', []),
  chats: store.read('chats', []),
  envelopes: store.read('envelopes', []),
  telemetry: store.read('telemetry', []),
  keys: store.read('keys', {}),
  audit: store.read('audit', []),
  otpRecords: store.read('otpRecords', {}),
  lockouts: store.read('lockouts', {})
};

if (db.users.length === 0) {
  db.users = [
    { id: crypto.randomUUID(), phone: '+14155550101', name: 'Alice', region: 'SF', createdAt: Date.now() - 86400000 },
    { id: crypto.randomUUID(), phone: '+14155550102', name: 'Bob', region: 'NY', createdAt: Date.now() - 86400000 }
  ];
}
if (db.telemetry.length === 0) {
  const now = Date.now();
  db.telemetry = Array.from({ length: 24 }).map((_, i) => {
    const ts = now - ((23 - i) * 60 * 60 * 1000);
    return {
      ts,
      sent: 8000 + Math.floor(Math.random() * 14000),
      recv: 7000 + Math.floor(Math.random() * 15000),
      active: 40 + Math.floor(Math.random() * 140),
      authFailures: Math.floor(Math.random() * 3),
      decryptFailures: Math.floor(Math.random() * 2),
      avgLatencyMs: 60 + Math.floor(Math.random() * 120),
      cpuLoad: 10 + Math.floor(Math.random() * 60),
      memoryMB: 180 + Math.floor(Math.random() * 260)
    };
  });
}

function persist() {
  ['users', 'chats', 'envelopes', 'telemetry', 'keys', 'audit', 'otpRecords', 'lockouts'].forEach((k) => store.write(k, db[k]));
}

function logAudit(event, severity = 'ok', details = {}) {
  db.audit.push({ id: crypto.randomUUID(), ts: Date.now(), event, severity, details });
  if (db.audit.length > 300) db.audit = db.audit.slice(-300);
  persist();
}

const auth = {
  async requestOTP(phone) {
    if (Date.now() < (db.lockouts[phone] || 0)) {
      logAudit('otp_request_blocked_lockout', 'warn', { phone });
      return null;
    }
    const otp = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    db.otpRecords[phone] = {
      hash: await sha256Hex(otp),
      expiresAt: Date.now() + SECURITY_POLICY.otpTTLms,
      attempts: 0
    };
    logAudit('otp_requested', 'ok', { phone });
    persist();
    return otp;
  },

  async verifyOTP(phone, code) {
    if (Date.now() < (db.lockouts[phone] || 0)) {
      logAudit('otp_verify_lockout', 'warn', { phone });
      return false;
    }

    const record = db.otpRecords[phone];
    if (!record || Date.now() > record.expiresAt) {
      delete db.otpRecords[phone];
      logAudit('otp_verify_expired_or_missing', 'warn', { phone });
      persist();
      return false;
    }

    const inputHash = await sha256Hex(code);
    if (secureEqual(record.hash, inputHash)) {
      delete db.otpRecords[phone];
      logAudit('otp_verify_success', 'ok', { phone });
      persist();
      return true;
    }

    record.attempts += 1;
    if (record.attempts >= SECURITY_POLICY.otpMaxAttempts) {
      delete db.otpRecords[phone];
      db.lockouts[phone] = Date.now() + SECURITY_POLICY.otpLockoutMs;
      logAudit('otp_lockout_applied', 'danger', { phone });
    } else {
      db.otpRecords[phone] = record;
      logAudit('otp_verify_failed', 'warn', { phone, attempts: record.attempts });
    }
    persist();
    return false;
  }
};

async function ensureUserKeys(userId) {
  if (db.keys[userId]) return db.keys[userId];

  const ecdh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const sign = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

  db.keys[userId] = {
    createdAt: Date.now(),
    ecdhPriv: await crypto.subtle.exportKey('jwk', ecdh.privateKey),
    ecdhPub: await crypto.subtle.exportKey('jwk', ecdh.publicKey),
    signPriv: await crypto.subtle.exportKey('jwk', sign.privateKey),
    signPub: await crypto.subtle.exportKey('jwk', sign.publicKey)
  };
  logAudit('keys_created', 'ok', { userId });
  persist();
  return db.keys[userId];
}

async function deriveChatKey(senderId, recipientId) {
  const sender = await ensureUserKeys(senderId);
  const recipient = await ensureUserKeys(recipientId);

  const senderPriv = await crypto.subtle.importKey('jwk', sender.ecdhPriv, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const recipientPub = await crypto.subtle.importKey('jwk', recipient.ecdhPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientPub },
    senderPriv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function ub64(str) { return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)); }
function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function encryptAndSign(chatId, senderId, recipientId, plaintext) {
  const key = await deriveChatKey(senderId, recipientId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`${chatId}|${senderId}|${recipientId}|v${SECURITY_POLICY.protocolVersion}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    new TextEncoder().encode(plaintext)
  );

  const senderKeys = await ensureUserKeys(senderId);
  const signingKey = await crypto.subtle.importKey('jwk', senderKeys.signPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, concatBytes(aad, new Uint8Array(ciphertext)));

  return {
    id: crypto.randomUUID(),
    protocolVersion: SECURITY_POLICY.protocolVersion,
    senderId,
    recipientId,
    chatId,
    sentAt: Date.now(),
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    signature: b64(signature),
    senderSigningPublicKey: senderKeys.signPub
  };
}

async function decryptEnvelope(envelope, viewerId) {
  try {
    const peerId = envelope.senderId === viewerId ? envelope.recipientId : envelope.senderId;
    const key = await deriveChatKey(viewerId, peerId);
    const aad = new TextEncoder().encode(`${envelope.chatId}|${envelope.senderId}|${envelope.recipientId}|v${envelope.protocolVersion}`);

    const verifyKey = await crypto.subtle.importKey('jwk', envelope.senderSigningPublicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ciphertext = ub64(envelope.ciphertext);
    const signatureOk = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      ub64(envelope.signature),
      concatBytes(aad, ciphertext)
    );

    if (!signatureOk) {
      logAudit('message_signature_invalid', 'danger', { envelopeId: envelope.id });
      return null;
    }

    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(envelope.iv), additionalData: aad }, key, ciphertext);
    return { ...envelope, text: new TextDecoder().decode(plain) };
  } catch {
    logAudit('message_decrypt_failed', 'warn', { envelopeId: envelope.id });
    return null;
  }
}

function findOrCreateChat(userA, userB) {
  let chat = db.chats.find((c) => c.participants.includes(userA) && c.participants.includes(userB) && c.participants.length === 2);
  if (!chat) {
    chat = { id: crypto.randomUUID(), title: 'Direct Secure Chat', participants: [userA, userB], createdAt: Date.now(), lastMessageAt: null };
    db.chats.push(chat);
    logAudit('chat_created', 'ok', { chatId: chat.id });
    persist();
  }
  return chat;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtNumber(n) { return new Intl.NumberFormat().format(n); }
function fmtBytes(n) {
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}
function fmtAgo(ts) {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function telemetrySnapshot() {
  const recent = db.telemetry.slice(-24);
  const sent = recent.reduce((a, t) => a + t.sent, 0);
  const recv = recent.reduce((a, t) => a + t.recv, 0);
  const peakUsers = Math.max(0, ...recent.map((t) => t.active));
  const avgLatency = recent.length ? Math.round(recent.reduce((a, t) => a + t.avgLatencyMs, 0) / recent.length) : 0;
  const decryptFailures = recent.reduce((a, t) => a + t.decryptFailures, 0);
  const authFailures = recent.reduce((a, t) => a + t.authFailures, 0);
  return { sent, recv, peakUsers, avgLatency, decryptFailures, authFailures };
}

function addTelemetryEvent({ sent = 0, recv = 0, authFailures = 0, decryptFailures = 0 } = {}) {
  const point = {
    ts: Date.now(),
    sent,
    recv,
    active: db.users.length,
    authFailures,
    decryptFailures,
    avgLatencyMs: 40 + Math.floor(Math.random() * 160),
    cpuLoad: 12 + Math.floor(Math.random() * 70),
    memoryMB: 190 + Math.floor(Math.random() * 340)
  };
  db.telemetry.push(point);
  if (db.telemetry.length > 240) db.telemetry = db.telemetry.slice(-240);
}

function linePath(points, width, height, maxY) {
  if (!points.length) return '';
  return points.map((v, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * width;
    const y = height - (v / Math.max(maxY, 1)) * height;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function renderLineChart(series) {
  const width = 800;
  const height = 220;
  const maxY = Math.max(1, ...series.flatMap((s) => s.values));
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" y1="${height * f}" x2="${width}" y2="${height * f}" stroke="#23314e" stroke-dasharray="4 4"/>`).join('');
  const paths = series.map((s) => `<path d="${linePath(s.values, width, height, maxY)}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}">${grid}${paths}</svg>`;
}

function renderBars(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.map((i) => {
    const w = Math.round((i.value / max) * 100);
    return `<div style="margin-bottom:8px"><div class="small">${i.label} <b>${fmtNumber(i.value)}</b></div><div style="background:#0a1224;border:1px solid #21304b;border-radius:999px;overflow:hidden"><div style="height:10px;background:${i.color};width:${w}%"></div></div></div>`;
  }).join('');
}

function project(lat, lon, w, h) {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

const REGION_DISTRIBUTION = [
  { region: 'North America', count: 312, lat: 38.4, lon: -97.4, color: '#22c55e' },
  { region: 'Europe', count: 248, lat: 50.1, lon: 10.4, color: '#38bdf8' },
  { region: 'South Asia', count: 401, lat: 20.6, lon: 78.9, color: '#f59e0b' },
  { region: 'South America', count: 146, lat: -14.2, lon: -51.9, color: '#e879f9' },
  { region: 'Africa', count: 122, lat: 7.2, lon: 21.1, color: '#ef4444' }
];

let state = {
  auth: { status: 'loggedOut', err: '' },
  user: null,
  tab: 'chats',
  selectedChat: null
};

function render() {
  const root = document.getElementById('app');
  if (state.auth.status !== 'authenticated') {
    renderLogin(root);
    return;
  }
  renderMain(root);
}

function renderLogin(root) {
  root.innerHTML = `<div class="card" style="max-width:560px;margin:50px auto;">
    <h2>SecureMessenger Web · Production Mode</h2>
    <div class="subtle">Local-first secure messaging demo with telemetry and security audit dashboard.</div>
    ${state.auth.err ? `<p style="color:#fca5a5">${state.auth.err}</p>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;">
      <input id="phone" placeholder="Enter mobile number" value="+1" style="flex:1"/>
      <button id="sendOtp">Send OTP</button>
    </div>
    <div id="otpWrap" style="margin-top:12px"></div>
  </div>`;

  document.getElementById('sendOtp').onclick = async () => {
    const phone = document.getElementById('phone').value.trim();
    const otp = await auth.requestOTP(phone);
    if (!otp) {
      state.auth = { status: 'loggedOut', err: 'Account temporarily locked. Please try again later.' };
      addTelemetryEvent({ authFailures: 1 });
      render();
      return;
    }

    document.getElementById('otpWrap').innerHTML = `
      <div class="small">Dev OTP: <b>${otp}</b> (expires in 2 min)</div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <input id="otp" placeholder="Enter OTP" style="flex:1"/>
        <button id="verifyOtp">Verify MFA</button>
      </div>`;

    document.getElementById('verifyOtp').onclick = async () => {
      const code = document.getElementById('otp').value.trim();
      const verified = await auth.verifyOTP(phone, code);
      if (!verified) {
        state.auth = { status: 'loggedOut', err: 'OTP invalid / expired / locked.' };
        addTelemetryEvent({ authFailures: 1 });
        render();
        return;
      }

      let user = db.users.find((u) => u.phone === phone);
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          phone,
          name: `User ${phone.slice(-4)}`,
          region: 'Unassigned',
          createdAt: Date.now()
        };
        db.users.push(user);
      }

      await ensureUserKeys(user.id);
      const peer = db.users.find((u) => u.id !== user.id);
      if (peer) findOrCreateChat(user.id, peer.id);
      addTelemetryEvent();
      persist();

      state = { ...state, auth: { status: 'authenticated' }, user, selectedChat: db.chats[0]?.id || null };
      render();
    };
  };
}

async function renderMain(root) {
  root.innerHTML = `<div class="tabs">
      <button class="tab ${state.tab === 'chats' ? 'active' : ''}" id="tabChats">Secure Chats</button>
      <button class="tab ${state.tab === 'dashboard' ? 'active' : ''}" id="tabDashboard">Operations Dashboard</button>
      <button class="tab" id="logout">Logout</button>
    </div>
    <div id="view"></div>`;

  document.getElementById('tabChats').onclick = () => { state.tab = 'chats'; render(); };
  document.getElementById('tabDashboard').onclick = () => { state.tab = 'dashboard'; render(); };
  document.getElementById('logout').onclick = () => {
    logAudit('session_logout', 'ok', { userId: state.user?.id });
    state = { auth: { status: 'loggedOut', err: '' }, user: null, tab: 'chats', selectedChat: null };
    render();
  };

  if (state.tab === 'dashboard') {
    renderDashboard(document.getElementById('view'));
    return;
  }

  await renderChats(document.getElementById('view'));
}

async function renderChats(view) {
  const myChats = db.chats.filter((c) => c.participants.includes(state.user.id));
  const selectedChat = myChats.find((c) => c.id === state.selectedChat) || myChats[0];
  if (selectedChat) state.selectedChat = selectedChat.id;

  const peer = selectedChat
    ? db.users.find((u) => u.id === selectedChat.participants.find((p) => p !== state.user.id))
    : null;

  const envelopes = selectedChat ? db.envelopes.filter((e) => e.chatId === selectedChat.id) : [];
  const decrypted = (await Promise.all(envelopes.map((e) => decryptEnvelope(e, state.user.id)))).filter(Boolean);

  view.innerHTML = `<div class="grid grid-2">
    <div class="card">
      <h3>Conversations</h3>
      <div class="small">Encrypted direct chats using ECDH + AES-GCM + ECDSA signatures.</div>
      <div style="margin-top:12px;">
        ${myChats.length ? myChats.map((chat) => `
          <div class="list-item ${selectedChat?.id === chat.id ? 'active' : ''}" data-chat="${chat.id}">
            <div><b>${chat.title}</b></div>
            <div class="small">${chat.lastMessageAt ? `Last activity ${fmtAgo(chat.lastMessageAt)}` : 'No messages yet'}</div>
          </div>`).join('') : '<div class="small">No conversations yet.</div>'}
      </div>
    </div>

    <div class="card">
      <h3>${peer ? `Chat with ${peer.name}` : 'No chat selected'}</h3>
      <div class="small">Protocol v${SECURITY_POLICY.protocolVersion} · Signature validated on read</div>
      <div class="messages" style="margin-top:10px;">
        ${decrypted.map((m) => `<div class="msg ${m.senderId === state.user.id ? 'mine' : 'theirs'}">${escapeHtml(m.text)}<div class="small">${new Date(m.sentAt).toLocaleTimeString()}</div></div>`).join('')}
      </div>
      <div class="composer">
        <input id="draft" placeholder="Type a secure message..." />
        <button id="sendMessage">Send</button>
      </div>
    </div>
  </div>`;

  view.querySelectorAll('[data-chat]').forEach((el) => {
    el.onclick = () => {
      state.selectedChat = el.dataset.chat;
      render();
    };
  });

  const sendButton = document.getElementById('sendMessage');
  if (!sendButton) return;

  sendButton.onclick = async () => {
    const text = document.getElementById('draft').value.trim();
    if (!text || !selectedChat || !peer) return;

    const envelope = await encryptAndSign(selectedChat.id, state.user.id, peer.id, text);
    db.envelopes.push(envelope);
    selectedChat.lastMessageAt = Date.now();
    addTelemetryEvent({ sent: text.length, recv: text.length });
    logAudit('message_sent', 'ok', { chatId: selectedChat.id, bytes: text.length });
    persist();
    render();
  };
}

function renderDashboard(view) {
  const snapshot = telemetrySnapshot();
  const recent = db.telemetry.slice(-24);
  const hourlyThroughput = recent.map((x) => x.sent + x.recv);
  const latency = recent.map((x) => x.avgLatencyMs);
  const cpu = recent.map((x) => x.cpuLoad);
  const memory = recent.map((x) => x.memoryMB);

  const keyInfo = db.keys[state.user.id];
  const keyAgeDays = keyInfo ? Math.floor((Date.now() - keyInfo.createdAt) / 86400000) : null;
  const keyRotationStatus = keyAgeDays === null ? 'unknown' : keyAgeDays > SECURITY_POLICY.keyRotationDays ? 'warn' : 'ok';

  const securityEvents = db.audit.slice(-12).reverse();
  const regionBars = REGION_DISTRIBUTION.map((r) => ({ label: r.region, value: r.count, color: r.color }));

  view.innerHTML = `<div class="card">
    <h3>Production Operations Dashboard</h3>
    <div class="small">Traffic, system health, security posture, telemetry and regional user distribution.</div>

    <div class="kpis" style="margin-top:12px;">
      <div class="kpi"><div class="label">24h Sent</div><div class="value">${fmtBytes(snapshot.sent)}</div></div>
      <div class="kpi"><div class="label">24h Received</div><div class="value">${fmtBytes(snapshot.recv)}</div></div>
      <div class="kpi"><div class="label">Peak Concurrent Users</div><div class="value">${fmtNumber(snapshot.peakUsers)}</div></div>
      <div class="kpi"><div class="label">Avg Network Latency</div><div class="value">${snapshot.avgLatency} ms</div></div>
      <div class="kpi"><div class="label">Auth / Decrypt Errors</div><div class="value">${snapshot.authFailures} / ${snapshot.decryptFailures}</div></div>
    </div>

    <div class="chart-grid" style="margin-top:14px;">
      <div class="chart-card">
        <h4>Traffic & Latency (24h)</h4>
        ${renderLineChart([
          { name: 'Throughput', color: '#22c55e', values: hourlyThroughput },
          { name: 'Latency', color: '#38bdf8', values: latency }
        ])}
        <div class="legend">
          <span><i class="dot-key" style="background:#22c55e"></i>Throughput (bytes)</span>
          <span><i class="dot-key" style="background:#38bdf8"></i>Latency (ms)</span>
        </div>
      </div>

      <div class="chart-card">
        <h4>System Resource Trend</h4>
        ${renderLineChart([
          { name: 'CPU', color: '#f59e0b', values: cpu },
          { name: 'Memory', color: '#ef4444', values: memory }
        ])}
        <div class="legend">
          <span><i class="dot-key" style="background:#f59e0b"></i>CPU %</span>
          <span><i class="dot-key" style="background:#ef4444"></i>Memory MB</span>
        </div>
      </div>
    </div>

    <div class="chart-grid" style="margin-top:14px;grid-template-columns:1fr 1fr;">
      <div class="chart-card">
        <h4>Regional User Distribution</h4>
        ${renderBars(regionBars)}
      </div>
      <div class="chart-card">
        <h4>Security Posture</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div>Protocol Version: <b>v${SECURITY_POLICY.protocolVersion}</b></div>
          <div>OTP Max Attempts: <b>${SECURITY_POLICY.otpMaxAttempts}</b></div>
          <div>OTP Lockout: <b>${Math.round(SECURITY_POLICY.otpLockoutMs / 60000)} min</b></div>
          <div>Key Rotation Age: <b>${keyAgeDays ?? 'n/a'} days</b> <span class="pill ${keyRotationStatus}">${keyRotationStatus === 'ok' ? 'healthy' : keyRotationStatus === 'warn' ? 'rotate key' : 'unknown'}</span></div>
        </div>
      </div>
    </div>

    <div style="margin-top:14px;" class="chart-card">
      <h4>Global User Map</h4>
      <div id="map" class="map"></div>
    </div>

    <div style="margin-top:14px;" class="chart-card">
      <h4>Security Audit Events</h4>
      <table class="table">
        <thead><tr><th>Time</th><th>Event</th><th>Severity</th><th>Details</th></tr></thead>
        <tbody>
          ${securityEvents.map((e) => `<tr>
            <td>${new Date(e.ts).toLocaleString()}</td>
            <td>${e.event}</td>
            <td><span class="pill ${e.severity}">${e.severity}</span></td>
            <td class="small">${escapeHtml(JSON.stringify(e.details))}</td>
          </tr>`).join('') || '<tr><td colspan="4">No events yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>`;

  const map = document.getElementById('map');
  REGION_DISTRIBUTION.forEach((r) => {
    const [x, y] = project(r.lat, r.lon, map.clientWidth, map.clientHeight);
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.background = r.color;

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = `${r.region}: ${fmtNumber(r.count)}`;

    dot.appendChild(badge);
    map.appendChild(dot);
  });
}

(async function bootstrap() {
  await Promise.all(db.users.map((u) => ensureUserKeys(u.id)));
  if (db.users.length >= 2 && db.chats.length === 0) {
    findOrCreateChat(db.users[0].id, db.users[1].id);
  }
  persist();
  render();
})();
