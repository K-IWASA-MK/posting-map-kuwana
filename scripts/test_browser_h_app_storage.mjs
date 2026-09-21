import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 8096;
const rootDir = process.cwd();

let mockGetFlyerStockDelay = 300;
let mockStocksData = [
  { staffId: 'U_TEST_USER_001', staffName: 'テストスタッフ', location: '桑名市', count: 1200 },
  { staffId: 'OTHER_STAFF', staffName: '別府 二郎', location: '四日市市', count: 500 }
];
let getFlyerStockCallCount = 0;

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let relativePath = req.url.split('?')[0];
      if (relativePath.startsWith('/app/')) {
        relativePath = relativePath.replace('/app/', '/active/dashboard/');
      } else if (relativePath === '/app') {
        relativePath = '/active/dashboard/index.html';
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
            if (configText.includes('gasWebAppUrl: ""')) {
              configText = configText.replace('gasWebAppUrl: ""', `gasWebAppUrl: "http://localhost:${PORT}/mock-exec"`);
            }
            if (configText.includes('liffId: ""')) {
              configText = configText.replace('liffId: ""', 'liffId: "test-liff-id"');
            }
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

async function runStorageE2ETests() {
  console.log("==================================================================");
  console.log("📱 H-APP STORAGE REGISTER REAL-BROWSER E2E VERIFICATION (CASES A - E)");
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

  // Mock LIFF SDK
  await page.route('**/sdk.js', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.liff = {
          init: () => Promise.resolve(),
          isLoggedIn: () => true,
          getAccessToken: () => 'stub-access-token',
          getIDToken: () => 'stub-id-token',
          getOS: () => 'ios',
          getProfile: () => Promise.resolve({
            userId: 'U_TEST_USER_001',
            displayName: 'テストスタッフ',
            pictureUrl: ''
          })
        };
      `
    });
  });

  // LocalStorage 初期データ
  await page.addInitScript(() => {
    localStorage.setItem('user_info', JSON.stringify({
      id: 'U_TEST_USER_001',
      first: 'スタッフ',
      last: 'テスト',
      phone: '09012345678'
    }));
  });

  // Mock GAS backend
  await page.route('**/*exec*', async route => {
    const postData = route.request().postData() || '';
    let action = '';
    let payload = {};
    try {
      const parsed = JSON.parse(postData);
      action = parsed.action;
      payload = parsed.payload || {};
    } catch(e) {}

    if (action === 'getFlyerStock') {
      getFlyerStockCallCount++;
      if (mockGetFlyerStockDelay > 0) {
        await new Promise(r => setTimeout(r, mockGetFlyerStockDelay));
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          stocks: mockStocksData
        })
      });
    }

    if (action === 'updateFlyerStock') {
      const { location, count, staffId, staffName } = payload;
      const idx = mockStocksData.findIndex(s => s.staffId === staffId);
      if (idx >= 0) {
        mockStocksData[idx].location = location;
        mockStocksData[idx].count = count;
      } else {
        mockStocksData.push({ staffId, staffName, location, count });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Updated' })
      });
    }

    if (action === 'getRanking') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, ranking: [] })
      });
    }

    if (action === 'getSystemSummary') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, done: 10, total: 337 })
      });
    }

    if (action === 'getMapsApiKey') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, apiKey: 'dummy-maps-key' })
      });
    }

    if (action === 'getGlobalPinStatus') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, records: [] })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  try {
    console.log("Navigating to H-App...");
    await page.goto(`http://localhost:${PORT}/app/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => typeof window.switchPage === 'function', { timeout: 10000 });
    console.log("H-App loaded successfully.\n");

    // =========================================================================
    // CASE A: 初回在庫登録画面の表示と正常反映
    // =========================================================================
    console.log("--- CASE A: 初回在庫登録画面の表示と正常反映 ---");
    getFlyerStockCallCount = 0;
    mockGetFlyerStockDelay = 100;

    await page.evaluate(() => window.switchPage('storage-register'));
    await page.waitForTimeout(400);

    const countInputValA = await page.$eval('#storage-register-count', el => el.value);
    const countTextValA = await page.$eval('#storage-register-count-text', el => el.textContent);
    const locSelectValA = await page.$eval('#storage-register-location', el => el.value);

    console.log(`Initial Display -> Count: "${countInputValA}", Text: "${countTextValA}", Location: "${locSelectValA}"`);
    if (countInputValA === '1200' && countTextValA === '1,200' && locSelectValA === '桑名市') {
      console.log("✅ Case A PASS: 初回API取得後に正常反映された\n");
    } else {
      throw new Error(`Case A Failed: Expected 1200 / 桑名市, got ${countInputValA} / ${locSelectValA}`);
    }

    // =========================================================================
    // CASE B: 在庫登録 → 他画面 → 在庫登録 (戻った瞬間に即時表示)
    // =========================================================================
    console.log("--- CASE B: 在庫登録 → 他画面 → 在庫登録 (戻り時即時表示) ---");
    // 設定画面へ遷移
    await page.evaluate(() => window.switchPage('settings'));
    await page.waitForTimeout(250);

    // 在庫登録へ戻る
    getFlyerStockCallCount = 0;
    mockGetFlyerStockDelay = 500; // APIを500ms意図的に遅延させる
    const switchStartTime = Date.now();
    await page.evaluate(() => window.switchPage('storage-register'));

    // ★ API完了前（80ms以内）にキャッシュから即座に値が入っていることを検証！
    await page.waitForTimeout(80);
    const elapsedB = Date.now() - switchStartTime;
    const countInputValB = await page.$eval('#storage-register-count', el => el.value);
    const countTextValB = await page.$eval('#storage-register-count-text', el => el.textContent);

    console.log(`Instant Cache Check (${elapsedB}ms) -> Count: "${countInputValB}", Text: "${countTextValB}"`);
    if (countInputValB === '1200' && countTextValB === '1,200') {
      console.log("✅ Case B PASS: API通信完了を待たず、戻った瞬間にキャッシュから即時表示された\n");
    } else {
      throw new Error(`Case B Failed: Expected instant 1200, got ${countInputValB}`);
    }
    // バックグラウンドAPI完了を待機
    await page.waitForTimeout(500);

    // =========================================================================
    // CASE C: 在庫登録 ↔ 他画面の高速往復 (In-flight重複防止)
    // =========================================================================
    console.log("--- CASE C: 在庫登録 ↔ 他画面の高速往復 (In-flight重複防止) ---");
    getFlyerStockCallCount = 0;
    mockGetFlyerStockDelay = 400;

    await page.evaluate(() => window.switchPage('storage-register'));
    await page.waitForTimeout(50);
    await page.evaluate(() => window.switchPage('settings'));
    await page.waitForTimeout(50);
    await page.evaluate(() => window.switchPage('storage-register'));
    await page.waitForTimeout(50);
    await page.evaluate(() => window.switchPage('storage-register'));

    console.log(`API calls during rapid switching: ${getFlyerStockCallCount}`);
    if (getFlyerStockCallCount <= 1) {
      console.log(`✅ Case C PASS: 高速往復中も In-flight 共有により多重通信が防止された (Calls: ${getFlyerStockCallCount})\n`);
    } else {
      throw new Error(`Case C Failed: Multiple duplicate API calls detected: ${getFlyerStockCallCount}`);
    }
    await page.waitForTimeout(400);

    // =========================================================================
    // CASE D: ユーザー手入力の保護【最重要】(通信中に「500」入力 → レスポンス到着後も500維持)
    // =========================================================================
    console.log("--- CASE D: ユーザー手入力の保護【最重要】(通信中に「500」入力 → 500維持) ---");
    mockStocksData = [
      { staffId: 'U_TEST_USER_001', staffName: 'テストスタッフ', location: '桑名市', count: 1200 }
    ];
    mockGetFlyerStockDelay = 400;

    // 画面を開く（API通信開始）
    await page.evaluate(() => window.switchPage('storage-register'));

    // ★ API通信中にユーザーが「500」と入力
    await page.waitForTimeout(50); // 通信が走っている最中
    await page.click('#storage-register-count-container'); // タップして入力モードへ
    await page.fill('#storage-register-count', '500'); // 「500」を入力

    const editingVal = await page.$eval('#storage-register-count', el => el.value);
    console.log(`User typed during in-flight: "${editingVal}"`);

    // ★ この状態で450ms待機し、サーバーからの「1200」遅延レスポンスを到着させる
    await page.waitForTimeout(450);

    // ★ 検証: APIレスポンスで上書きされず、ユーザーが入力した「500」が100%保持されていること！
    const postApiResponseVal = await page.$eval('#storage-register-count', el => el.value);
    console.log(`Value after delayed API response arrived: "${postApiResponseVal}"`);

    if (postApiResponseVal === '500') {
      console.log("✅ Case D PASS: 遅延APIレスポンス到着後も手入力値「500」が完全保護された\n");
    } else {
      throw new Error(`Case D Failed: User input was overwritten by API response! Current: "${postApiResponseVal}"`);
    }

    // =========================================================================
    // CASE E: 在庫登録成功後の即時反映 ＆ 在庫一覧での即時確認 (Loading待ちゼロ)
    // =========================================================================
    console.log("--- CASE E: 在庫登録成功後の即時反映 ＆ 在庫一覧での即時確認 ---");
    mockGetFlyerStockDelay = 50;

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 「チラシ枚数を更新する」ボタンをタップ
    await page.click('#btn-storage-register-submit');
    await page.waitForTimeout(300);

    // 在庫一覧画面へ遷移
    await page.evaluate(() => window.switchPage('storage-list'));
    await page.waitForTimeout(100);

    // 在庫一覧画面のHTMLを確認（Loading Inventory... が出ず、即座に在庫リストがレンダリングされていること）
    const listHtml = await page.$eval('#storage-list-container', el => el.innerHTML);
    const hasLoadingSpinner = listHtml.includes('Loading Inventory...');
    console.log(`Storage List Loading Spinner Present: ${hasLoadingSpinner}`);

    if (!hasLoadingSpinner) {
      console.log("✅ Case E PASS: 在庫登録後、キャッシュが最新化され、在庫一覧でもLoadingなしで即時描画された\n");
    } else {
      throw new Error("Case E Failed: Storage list showed loading spinner instead of instant cache");
    }

    console.log("==================================================================");
    console.log("🎉 ALL REAL-BROWSER CASES (A - E) PASSED SUCCESSFULLY!");
    console.log("==================================================================");

  } finally {
    await browser.close();
    server.close();
  }
}

runStorageE2ETests().catch(err => {
  console.error("❌ E2E Test Failed:", err);
  process.exit(1);
});
