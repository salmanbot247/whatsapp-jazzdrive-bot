require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const NodeCache = require('node-cache');
const { downloadMedia, ensureYtDlp } = require('./downloader');
const { requestOTP, verifyOTP, uploadFile, cleanupFile, isTokenValid } = require('./jazzdrive');

const userStates = new Map();
const msgRetryCounterCache = new NodeCache();

// ── URL check ────────────────────────────
function extractURL(text) {
  const m = text.match(/(https?:\/\/[^\s]+)/);
  return m ? m[0] : null;
}
function isSupportedURL(url) {
  return ['youtube.com','youtu.be','facebook.com','fb.watch',
          'instagram.com','twitter.com','x.com','tiktok.com',
          'dailymotion.com','soundcloud.com'].some(d => url.includes(d));
}

async function sendMsg(sock, jid, text) {
  await sock.sendMessage(jid, { text });
}

// ── Message Handler ───────────────────────
async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!msg.key.fromMe) return; // sirf apne messages

  const text = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text || ''
  ).trim();

  if (!text) return;

  const state = userStates.get(jid) || { step: 'idle' };

  // ── STEP 1: URL detect ──────────────────
  if (state.step === 'idle') {
    const url = extractURL(text);
    if (!url || !isSupportedURL(url)) return;

    await sendMsg(sock, jid, '🔍 Video info check ho rahi hai...');

    try {
      const { getVideoInfo } = require('./downloader');
      const info = await getVideoInfo(url);
      const dur = info.duration
        ? `${Math.floor(info.duration/60)}:${String(info.duration%60).padStart(2,'0')}`
        : 'N/A';

      userStates.set(jid, { step: 'awaiting_quality', url, title: info.title || 'Video' });

      await sendMsg(sock, jid,
        `📹 *${info.title}*\n⏱️ ${dur}  👤 ${info.uploader||''}\n\n` +
        `🎬 *VIDEO SELECTOR*\n\n` +
        `1️⃣ 360p (Fast)\n2️⃣ 720p (HD)\n3️⃣ 1080p (FHD)\n4️⃣ MP3 (Audio)\n\n` +
        `_1, 2, 3 ya 4 reply karo_`
      );
    } catch (err) {
      await sendMsg(sock, jid, `❌ Video info nahi mili: ${err.message}`);
    }
    return;
  }

  // ── STEP 2: Quality ─────────────────────
  if (state.step === 'awaiting_quality') {
    if (!['1','2','3','4'].includes(text)) {
      await sendMsg(sock, jid, '❌ Sirf 1, 2, 3 ya 4 bhejo');
      return;
    }
    const names = {'1':'360p','2':'720p','3':'1080p','4':'MP3'};
    userStates.set(jid, { ...state, step: 'awaiting_jazz_number', quality: text });
    await sendMsg(sock, jid,
      `✅ *${names[text]}* select hua\n\n📱 *Jazz Number enter karo (03XXXXXXXXX):*\n_(2 minute mein enter karo)_`
    );
    return;
  }

  // ── STEP 3: Jazz number → OTP ───────────
  if (state.step === 'awaiting_jazz_number') {
    if (!/^03[0-9]{9}$/.test(text)) {
      await sendMsg(sock, jid, '❌ Galat format. 03XXXXXXXXX (11 numbers)');
      return;
    }
    await sendMsg(sock, jid, '📤 OTP bheja ja raha hai...');
    const result = await requestOTP(text);
    if (!result.success) {
      await sendMsg(sock, jid, `❌ OTP fail: ${result.error}`);
      userStates.set(jid, { step: 'idle' });
      return;
    }
    userStates.set(jid, { ...state, step: 'awaiting_otp', jazzPhone: text });
    await sendMsg(sock, jid, `✅ OTP *${text}* pe bheja gaya!\n\n🔑 OTP enter karo:`);
    return;
  }

  // ── STEP 4: OTP → Download → Upload ─────
  if (state.step === 'awaiting_otp') {
    if (!/^[0-9]{4,6}$/.test(text)) {
      await sendMsg(sock, jid, '❌ OTP sirf numbers (4-6 digits)');
      return;
    }

    await sendMsg(sock, jid, '🔐 OTP verify ho raha hai...');
    const loginResult = await verifyOTP(state.jazzPhone, text);
    if (!loginResult.success) {
      await sendMsg(sock, jid, `❌ Login fail: ${loginResult.error}`);
      userStates.set(jid, { step: 'idle' });
      return;
    }

    await sendMsg(sock, jid, '✅ JazzDrive login ho gaya!\n\n⬇️ Download ho raha hai...');

    // Download
    let dl;
    try {
      dl = await downloadMedia(state.url, state.quality);
    } catch (err) {
      await sendMsg(sock, jid, `❌ Download fail: ${err.message}`);
      userStates.set(jid, { step: 'idle' });
      return;
    }

    await sendMsg(sock, jid,
      `✅ Download complete!\n📁 ${dl.fileName}\n📦 ${(dl.fileSize/1024/1024).toFixed(2)} MB\n\n☁️ JazzDrive pe upload ho raha hai...`
    );

    // Upload
    const up = await uploadFile(dl.filePath, dl.fileName);
    cleanupFile(dl.filePath);

    if (!up.success) {
      await sendMsg(sock, jid, `❌ Upload fail: ${up.error}`);
      userStates.set(jid, { step: 'idle' });
      return;
    }

    await sendMsg(sock, jid,
      `🎉 *Upload Complete!*\n\n` +
      `📂 *${state.title}*\n` +
      `📦 Size: ${up.fileSize}\n\n` +
      `_JazzDrive app mein check karo — bilkul free!_ ✅`
    );

    userStates.set(jid, { step: 'idle' });
  }
}

// ── Bot Start ─────────────────────────────
async function startBot() {
  console.log('🤖 Bot start ho raha hai...');
  ensureYtDlp();

  const { state, saveCreds } = await useMultiFileAuthState('./auth_session');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    logger: pino({ level: 'silent' }),
    msgRetryCounterCache,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false
  });

  // Pairing code
  if (!sock.authState.creds.registered) {
    let phone = process.env.BOT_NUMBER;
    if (!phone) { console.error('❌ BOT_NUMBER .env mein set karo!'); process.exit(1); }
    // Number clean: sirf digits, 03xxx -> 923xxx
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '92' + phone.slice(1);
    console.log('📱 Using number: ' + phone);
    await new Promise(r => setTimeout(r, 3000));
    const code = await sock.requestPairingCode(phone);
    console.log('\n' + '='.repeat(40));
    console.log(`📱 PAIRING CODE: ${code}`);
    console.log('='.repeat(40));
    console.log('WhatsApp > Linked Devices > Link with phone number\n');
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const retry = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Retry:', retry);
      if (retry) setTimeout(startBot, 5000);
    } else if (connection === 'open') {
      console.log('✅ WhatsApp connected!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try { await handleMessage(sock, msg); } catch (err) { console.error(err); }
    }
  });
}

startBot().catch(console.error);
