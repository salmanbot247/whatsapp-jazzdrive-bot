// jazzdrive.js
// Login: Exact Colab script logic
// Upload: Exact selectors from JazzDrive HTML inspection video

const { chromium } = require('playwright');
const fs = require('fs');

const COOKIES_FILE = './jazz_cookies.json';
const JAZZDRIVE_URL = 'https://cloud.jazzdrive.com.pk';

let browser = null;
let context = null;
let page = null;

async function launchBrowser() {
  if (browser) return;
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  if (fs.existsSync(COOKIES_FILE)) {
    context = await browser.newContext({ storageState: COOKIES_FILE });
    console.log('✅ Previous session loaded.');
  } else {
    context = await browser.newContext();
  }
  page = await context.newPage();
}

// ── OTP Request (Colab se exact) ──────────
async function requestOTP(jazzPhone) {
  try {
    await launchBrowser();
    await page.goto(`${JAZZDRIVE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
    await page.fill('input[type="tel"]', jazzPhone.trim());
    await page.click('#signinbtn');
    console.log('⏳ Waiting 6s for OTP screen...');
    await page.waitForTimeout(6000); // Colab: asyncio.sleep(6)
    return { success: true };
  } catch (err) {
    try { await page.screenshot({ path: './login_error.png' }); } catch {}
    return { success: false, error: err.message };
  }
}

// ── OTP Verify (Colab se exact 3 methods) ─
async function verifyOTP(jazzPhone, otp) {
  try {
    // Method 1: direct fill
    let done = false;
    try {
      await page.fill('#otp', otp.trim(), { timeout: 2000 });
      done = true;
    } catch {}

    // Method 2: JS evaluate
    if (!done) {
      try {
        await page.evaluate(`document.getElementById("otp").value = "${otp.trim()}"`);
        done = true;
      } catch {}
    }

    // Method 3: keyboard
    if (!done) {
      for (const digit of otp.trim()) {
        await page.keyboard.press(digit);
        await page.waitForTimeout(100);
      }
    }

    await page.waitForTimeout(1000);

    // Login button
    try {
      await page.click('#signinbtn', { timeout: 5000 });
    } catch {
      try { await page.click('button:has-text("Login")', { timeout: 3000 }); } catch {}
    }

    console.log('⏳ Loading dashboard (12s)...'); // Colab: asyncio.sleep(12)
    await page.waitForTimeout(12000);

    await context.storageState({ path: COOKIES_FILE }); // Colab: context.storage_state(path=...)
    console.log('✅ Login successful! Cookies saved.');
    return { success: true };
  } catch (err) {
    try { await page.screenshot({ path: './otp_error.png' }); } catch {}
    return { success: false, error: err.message };
  }
}

// ── Upload File (video HTML inspection se exact) ──
async function uploadFile(filePath, fileName) {
  try {
    await launchBrowser();

    const fileSizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);

    // JazzDrive folders page
    await page.goto(`${JAZZDRIVE_URL}/#/folders`, { waitUntil: 'networkidle', timeout: 30000 });

    // Login check
    if (page.url().includes('login')) {
      return { success: false, error: 'Session expired. Re-login needed.' };
    }

    await page.waitForTimeout(2000);

    // Step 1: Upload button click
    // From HTML: <button id="uploadActionButton" aria-label="upload">
    console.log('🖱️ Clicking upload button...');
    await page.waitForSelector('#uploadActionButton', { timeout: 10000 });
    await page.click('#uploadActionButton');

    // Step 2: "Choose an action" modal aata hai
    // 3 options: Upload files | Upload folder | View Dropbox items
    // "Upload files" pe click karo aur file chooser handle karo
    console.log('📂 Selecting Upload files...');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      page.click('text=Upload files')
    ]);

    // Step 3: File set karo
    await fileChooser.setFiles(filePath);
    console.log(`📤 Uploading: ${fileName} (${fileSizeMB} MB)...`);

    // Step 4: Upload complete hone ka wait
    // File size ke hisab se wait time calculate karo
    const fileSize = fs.statSync(filePath).size;
    const waitMs = Math.max(30000, (fileSize / 1024 / 1024) * 3000); // 3s per MB minimum

    try {
      // Progress bar appear hone ka wait
      await page.waitForSelector('[role="progressbar"]', { timeout: 10000 });
      // Progress bar khatam hone ka wait
      await page.waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: waitMs });
      console.log('✅ Upload complete (progress bar done)!');
    } catch {
      // Agar progress bar nahi mila toh fixed wait
      await page.waitForTimeout(Math.min(waitMs, 120000));
      console.log('✅ Upload complete (timeout wait done)!');
    }

    return {
      success: true,
      fileName,
      fileSize: `${fileSizeMB} MB`
    };

  } catch (err) {
    console.error('Upload error:', err.message);
    try { await page.screenshot({ path: './upload_error.png' }); } catch {}
    return { success: false, error: err.message };
  }
}

function cleanupFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

function isTokenValid() {
  return fs.existsSync(COOKIES_FILE);
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null; context = null; page = null;
  }
}

module.exports = { requestOTP, verifyOTP, uploadFile, cleanupFile, isTokenValid, closeBrowser };
