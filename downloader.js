const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function ensureYtDlp() {
  try {
    execSync('yt-dlp --version', { stdio: 'pipe' });
  } catch {
    try {
      execSync('pip install yt-dlp --break-system-packages -q', { stdio: 'inherit' });
    } catch {
      execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp', { stdio: 'inherit' });
    }
  }
}

async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    exec(`yt-dlp --dump-json --no-playlist "${url}"`, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        const info = JSON.parse(stdout);
        resolve({ title: info.title, duration: info.duration, uploader: info.uploader });
      } catch { reject(new Error('Parse error')); }
    });
  });
}

async function downloadMedia(url, quality) {
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
    exec(`yt-dlp ${args} --no-playlist --no-warnings -o "${out}" "${url}"`, (err, stdout, stderr) => {
      if (err) return reject(new Error('Download failed: ' + (stderr || err.message)));
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
      if (!files.length) return reject(new Error('File not found after download'));
      const filePath = path.join(DOWNLOAD_DIR, files[0]);
      resolve({ filePath, fileName: files[0], fileSize: fs.statSync(filePath).size });
    });
  });
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
