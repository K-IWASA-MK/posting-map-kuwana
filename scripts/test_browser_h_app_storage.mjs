import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const PORT = 8097;
const rootDir = process.cwd();

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let relativePath = req.url.split('?')[0];
      if (relativePath.startsWith('/app/')) {
        relativePath = relativePath.replace('/app/', '/active/h-app/');
      } else if (relativePath === '/app') {
        relativePath = '/active/h-app/index.html';
      } else if (relativePath.startsWith('/business/')) {
        relativePath = relativePath.replace('/business/', '/active/business/');
      }
      let filePath = path.join(rootDir, relativePath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end(`File not found: ${req.url}`);
        } else {
          let contentType = 'text/html';
          if (filePath.endsWith('.js')) contentType = 'application/javascript';
          if (filePath.endsWith('.css')) contentType = 'text/css';
          if (filePath.endsWith('.json')) contentType = 'application/json';
          if (filePath.endsWith('.png')) contentType = 'image/png';
          if (filePath.endsWith('.csv')) contentType = 'text/plain; charset=utf-8';

          let responseData = data;
          if (filePath.endsWith('config.js')) {
            let configText = data.toString('utf8');
            configText = configText.replace(/gasWebAppUrl:\s*["'][^"']*["']/, `gasWebAppUrl: "http://localhost:${PORT}/mock-exec"`);
            configText = configText.replace(/liffId:\s*["'][^"']*["']/, 'liffId: "test-liff-id"');
            responseData = Buffer.from(configText, 'utf8');
          }

          res.writeHead(200, { 'Content-Type': contentType });
          res.end(responseData);
        }
      });
    });
    server.listen(PORT, () => {
      resolve(server);
    });
  });
}

async function runBrowserStorageTests() {
  console.log("==================================================================");
  console.log("📦 H-APP STORAGE REGISTER & LIST REAL-BROWSER AUDIT (Wave 9)");
  console.log("==================================================================\n");

  const server = await startLocalServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.0.0'
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('  [BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('  [BROWSER ERROR]', err.message));

  // Mock LIFF SDK
  await page.route('**/sdk.js', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.liff = {
          init: () => Promise.resolve(),
          isLoggedIn: () => true,
          getProfile: () => Promise.resolve({
            userId: 'U1234567890abcdef',
            displayName: 'テスト配布員',
            pictureUrl: 'https://example.com/pic.jpg'
          }),
          getIDToken: () => 'mock-id-token',
          getAccessToken: () => 'mock-access-token'
        };
      `
    });
  });

  // Mock Google Maps API
  await page.route('**/maps/api/js*', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.google = {
          maps: {
            Map: class { constructor() {} setCenter() {} setZoom() {} addListener() {} panTo() {} },
            Marker: class { constructor() {} setMap() {} setPosition() {} addListener() {} },
            Polygon: class { constructor() {} setMap() {} addListener() {} },
            LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
            LatLngBounds: class { extend() {} getCenter() { return { lat: () => 0, lng: () => 0 }; } }
          }
        };
      `
    });
  });

  // Mock GAS API
  let updatedStockPayload = null;
  await page.route('**/*exec*', async route => {
    const postData = route.request().postData();
    let action = '';
    try {
      const parsed = JSON.parse(postData || '{}');
      action = parsed.action;
      if (action === 'updateFlyerStock') {
        updatedStockPayload = parsed;
      }
    } catch(e) {}

    if (action === 'getFlyerStock') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          stocks: [
            { id: "STK001", staffId: "S002", staffName: "鈴木 一郎", location: "桑名市", count: 1200, updatedAt: "2026/10/06 10:00" },
            { id: "STK002", staffId: "S001", staffName: "テスト配布員", location: "桑名市", count: 500, updatedAt: "2026/10/06 12:00", isMe: true }
          ],
          myStock: { location: "桑名市", count: 500 }
        })
      });
      return;
    }

    if (action === 'updateFlyerStock') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: "更新完了"
        })
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        authorized: true,
        registered: true,
        staffId: 'S001',
        staffName: 'テスト配布員',
        staff: {
          id: 'S001',
          name: 'テスト配布員',
          branch: '桑名支部',
          registrationDate: '2025/07/01'
        },
        areas: [],
        stats: {}
      })
    });
  });

  try {
    console.log("🚀 Navigating to H-App...");
    await page.goto(`http://localhost:${PORT}/app/index.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // 認証済み配布員情報のセットアップ
    await page.evaluate(() => {
      localStorage.setItem('user_info', JSON.stringify({
        id: 'S001',
        first: '太郎',
        last: '桑名',
        branch: '桑名支部'
      }));

      // ローディングオーバーレイを除去
      const loading = document.getElementById('loading');
      if (loading) {
        loading.style.display = 'none';
        loading.remove();
      }

      // アプリメインコンテナを表示
      const appEl = document.getElementById('app');
      if (appEl) {
        appEl.classList.remove('hidden', 'opacity-0');
        appEl.style.display = 'flex';
        appEl.style.opacity = '1';
      }
    });

    // Dialog alert ハンドラ
    let lastDialogMessage = '';
    page.on('dialog', async dialog => {
      lastDialogMessage = dialog.message();
      await dialog.accept();
    });

    // ─────────────────────────────────────────────────────────
    // 👉 CASE A: 在庫登録画面への遷移 & 初期表示検証
    // ─────────────────────────────────────────────────────────
    console.log("👉 CASE A: Storage register page initialization & display");
    await page.evaluate(() => {
      if (typeof window.switchPage === 'function') {
        window.switchPage('storage-register');
      }
    });
    // 非同期 fetchStock 完了を待機
    await page.waitForTimeout(1000);

    const initFormState = await page.evaluate(() => {
      const locText = document.getElementById('storage-location-text');
      const locSelect = document.getElementById('storage-register-location');
      const countInput = document.getElementById('storage-register-count');
      const countDisplay = document.getElementById('storage-register-count-text');
      const submitBtn = document.getElementById('btn-storage-register-submit');
      return {
        locText: locText ? locText.textContent.trim() : null,
        location: locSelect ? locSelect.value : null,
        count: countInput ? countInput.value : null,
        countDisplayText: countDisplay ? countDisplay.textContent.trim() : null,
        btnText: submitBtn ? submitBtn.textContent.trim() : null,
        btnDisabled: submitBtn ? submitBtn.disabled : null
      };
    });

    assert.ok(initFormState.locText, '保管場所テキストが表示されていること');
    assert.ok(initFormState.location, '保管場所が設定されていること');
    assert.equal(initFormState.count, '500', '初期枚数 500 が反映されていること');
    assert.equal(initFormState.countDisplayText, '500', '枚数表示 500 が描画されていること');
    assert.equal(initFormState.btnDisabled, false, 'ボタンが活性化されていること');
    console.log("  ✅ Case A PASSED: Storage register page initialized successfully");

    // ─────────────────────────────────────────────────────────
    // 👉 CASE B: 入力フォーマッター & ボタン文言動的更新
    // ─────────────────────────────────────────────────────────
    console.log("👉 CASE B: Input formatter & button text dynamic update");
    await page.evaluate(() => {
      const countInput = document.getElementById('storage-register-count');
      countInput.value = '1500';
      countInput.dispatchEvent(new Event('input'));
      countInput.dispatchEvent(new Event('blur'));
    });
    await page.waitForTimeout(300);

    const updatedInputState = await page.evaluate(() => {
      const countDisplay = document.getElementById('storage-register-count-text');
      const submitBtn = document.getElementById('btn-storage-register-submit');
      return {
        countDisplayText: countDisplay ? countDisplay.textContent.trim() : null,
        btnText: submitBtn ? submitBtn.textContent.trim() : null
      };
    });

    assert.equal(updatedInputState.countDisplayText, '1,500', 'カンマ区切りで 1,500 とフォーマットされること');
    assert.equal(updatedInputState.btnText, 'チラシ枚数を更新する', 'ボタン文言が「更新する」になること');
    console.log("  ✅ Case B PASSED: Input formatter & button text verified");

    // ─────────────────────────────────────────────────────────
    // 👉 CASE C: 在庫更新の送信 & アラート & ボタン復元
    // ─────────────────────────────────────────────────────────
    console.log("👉 CASE C: Stock update submission & feedback cycle");
    await page.evaluate(() => {
      window.submitFlyerStock();
    });
    await page.waitForTimeout(800);

    assert.ok(lastDialogMessage.includes('チラシ枚数を更新しました'), '更新成功のアラートが表示されること');
    assert.ok(updatedStockPayload, 'API にペイロードが送信されたこと');
    assert.equal(updatedStockPayload.count, 1500, '更新枚数 1500 が送信されたこと');

    const postSubmitBtnState = await page.evaluate(() => {
      const btn = document.getElementById('btn-storage-register-submit');
      return {
        disabled: btn ? btn.disabled : null,
        text: btn ? btn.textContent.trim() : null
      };
    });
    assert.equal(postSubmitBtnState.disabled, false, '送信完了後にボタンが活性復元されること');
    console.log("  ✅ Case C PASSED: Stock update submitted & button state restored");

    // ─────────────────────────────────────────────────────────
    // 👉 CASE D: 在庫一覧画面への遷移 & 一覧描画検証
    // ─────────────────────────────────────────────────────────
    console.log("👉 CASE D: Storage list page transition & render");
    await page.evaluate(() => {
      if (typeof window.switchPage === 'function') {
        window.switchPage('storage-list');
      }
    });
    await page.waitForTimeout(600);

    const listState = await page.evaluate(() => {
      const container = document.getElementById('storage-list-container');
      const rows = container ? container.querySelectorAll('.stock-row') : [];
      return {
        hasContainer: !!container,
        rowCount: rows.length,
        hasTransferBtn: container ? container.innerHTML.includes('受渡要請') : false,
        hasOtherStaff: container ? container.innerHTML.includes('鈴木 一郎') : false,
        hasMyStaff: container ? container.innerHTML.includes('テスト配布員') : false
      };
    });

    assert.ok(listState.hasContainer, '在庫一覧コンテナが存在すること');
    assert.ok(listState.rowCount >= 1, '他配布員の在庫行が表示されていること');
    assert.equal(listState.hasTransferBtn, true, '受渡要請ボタンが存在すること');
    assert.equal(listState.hasOtherStaff, true, '他配布員（鈴木 一郎）が表示されていること');
    assert.equal(listState.hasMyStaff, false, '自分の在庫（テスト配布員）は一覧から除外されていること');
    console.log("  ✅ Case D PASSED: Storage list rendered & transfer button present");

    console.log("\n==================================================================");
    console.log("🏆 ALL REAL-BROWSER STORAGE AUDIT CASES (A - D) PASSED!");
    console.log("==================================================================");

  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

runBrowserStorageTests().catch(err => {
  console.error("❌ Browser test failed:", err);
  process.exit(1);
});
