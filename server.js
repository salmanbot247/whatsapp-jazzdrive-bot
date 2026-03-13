// server.js - Pairing Code Website
// Bilkul us bande jaisa: number enter karo, code lo, WhatsApp mein daalo

const express = require('express');
const app = express();
app.use(express.json());

let sockInstance = null; // bot ka WhatsApp connection

// Bot ka sock yahan register karo
function registerSock(sock) {
  sockInstance = sock;
}

// ── Web Page ─────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp JazzDrive Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #00ffff;
      font-family: 'Courier New', monospace;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      text-align: center;
      padding: 40px 20px;
      max-width: 400px;
      width: 100%;
    }
    .avatar {
      width: 100px;
      height: 100px;
      background: #1a1a2e;
      border-radius: 50%;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 50px;
      border: 2px solid #00ffff;
    }
    h1 { font-size: 28px; letter-spacing: 4px; margin-bottom: 8px; }
    .subtitle { color: #00aaaa; font-size: 12px; letter-spacing: 2px; margin-bottom: 30px; }
    input {
      width: 100%;
      padding: 14px;
      background: transparent;
      border: 1.5px solid #00ffff;
      border-radius: 6px;
      color: #00ffff;
      font-size: 16px;
      text-align: center;
      letter-spacing: 2px;
      margin-bottom: 8px;
      outline: none;
    }
    input::placeholder { color: #005555; }
    .hint { font-size: 11px; color: #005555; margin-bottom: 20px; }
    button {
      width: 100%;
      padding: 14px;
      background: #00ffff;
      color: #0a0a0a;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: bold;
      letter-spacing: 2px;
      cursor: pointer;
    }
    button:disabled { background: #005555; cursor: not-allowed; }
    .status { margin-top: 20px; min-height: 24px; font-size: 14px; }
    .code-box {
      margin-top: 20px;
      padding: 16px;
      background: #0d0d1a;
      border: 1.5px solid #00ffff;
      border-radius: 6px;
      font-size: 28px;
      letter-spacing: 6px;
      display: none;
    }
    .system-dot {
      position: fixed; top: 16px; right: 16px;
      font-size: 11px; color: #555;
    }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #00ff00; margin-left: 4px; }
  </style>
</head>
<body>
  <div class="system-dot">SYSTEM <span class="dot"></span></div>
  <div class="container">
    <div class="avatar">🤖</div>
    <h1>JAZZ BOT</h1>
    <p class="subtitle">MULTI-DEVICE PAIRING</p>
    <input type="tel" id="phone" placeholder="923XXXXXXXXX" maxlength="12">
    <p class="hint">ENTER NUMBER WITHOUT +</p>
    <button id="btn" onclick="connect()">CONNECT NOW</button>
    <div class="status" id="status"></div>
    <div class="code-box" id="codebox"></div>
  </div>
  <script>
    async function connect() {
      const phone = document.getElementById('phone').value.trim();
      if (!phone || phone.length < 10) {
        document.getElementById('status').innerHTML = '❌ Number sahi daalo';
        return;
      }
      document.getElementById('btn').disabled = true;
      document.getElementById('status').innerHTML = '⏳ Generating code...';
      document.getElementById('codebox').style.display = 'none';
      try {
        const res = await fetch('/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.code) {
          document.getElementById('status').innerHTML = '✅ PAIRING CODE GENERATED';
          document.getElementById('codebox').style.display = 'block';
          document.getElementById('codebox').innerHTML = data.code;
        } else {
          document.getElementById('status').innerHTML = '❌ ' + (data.error || 'Error');
        }
      } catch (e) {
        document.getElementById('status').innerHTML = '❌ Server error';
      }
      document.getElementById('btn').disabled = false;
    }
  </script>
</body>
</html>`);
});

// ── Pairing Code Generate ────────────────
app.post('/pair', async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.json({ error: 'Number required' });

    // Clean number
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '92' + phone.slice(1);

    if (!sockInstance) {
      return res.json({ error: 'Bot not ready yet. 30 second baad try karo.' });
    }

    const code = await sockInstance.requestPairingCode(phone);
    console.log(`Pairing code generated for ${phone}: ${code}`);
    res.json({ code });

  } catch (err) {
    console.error('Pairing error:', err.message);
    res.json({ error: err.message });
  }
});

function startServer() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🌐 Web server: http://localhost:${PORT}`);
  });
}

module.exports = { startServer, registerSock };
