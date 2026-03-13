const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function getYtDlpCmd() {
  const paths = ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', '/root/.local/bin/yt-dlp'];
  for (const p of paths) {
    try { execSync(`${p} --version`, { stdio: 'pipe' }); return p; } catch {}
  }
  return 'yt-dlp'; // fallback - crash nahi karega startup pe
}

// Sirf log karo - koi install nahi, koi crash nahi
function ensureYtDlp() {
  const cmd = getYtDlpCmd();
  console.log(`✅ yt-dlp path: ${cmd}`);
}

async function getVideoInfo(url) {
  const cmd = getYtDlpCmd();
  return new Promise((resolve, reject) => {
    exec(`${cmd} --dump-json --no-playlist "${url}"`, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        const info = JSON.parse(stdout);
        resolve({ title: info.title, duration: info.duration, uploader: info.uploader });
      } catch { reject(new Error('Parse error')); }
    });
  });
}

async function downloadMedia(url, quality) {
  const cmd = getYtDlpCmd();
  return new Promise((resolve, reject) => {
    let args = '';
    switch (quality) {
      case '1': args = '-f "bestvideo[height<=360]+bestaudio/best[height<=360]" --merge-output-format mp4'; break;
      case '2': args = '-f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4'; break;
      case '3': args = '-f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" --merge-output-format mp4'; break;
      case '4': args = '-f bestaudio --extract-audio --audio-format mp3 --audio-quality 0'; break;
      default:  args = '-f "best[height<=720]" --merge-output-format mp4';
    }
    const ts = Date.now();
    const out = path.join(DOWNLOAD_DIR, `${ts}.%(ext)s`);
    exec(`${cmd} ${args} --no-playlist --no-warnings -o "${out}" "${url}"`,
      { timeout: 300000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error('Download failed: ' + (stderr || err.message)));
        const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
        if (!files.length) return reject(new Error('File not found after download'));
        const filePath = path.join(DOWNLOAD_DIR, files[0]);
        resolve({ filePath, fileName: files[0], fileSize: fs.statSync(filePath).size });
      }
    );
  });
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
