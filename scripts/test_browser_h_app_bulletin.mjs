import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 8094;
const rootDir = process.cwd();

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
          console.log(`[TEST SERVER 404] ${req.url}`);
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

async function runBulletinE2ETests() {
  console.log("===============================================================");
  console.log("📱 H-APP BULLETIN REAL-BROWSER E2E VERIFICATION (CASES A - H)");
  console.log("===============================================================\n");

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

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', req => {
    failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

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

  // Mock GAS backend responses with configurable delay and failures
  let bulletinDelayMs = 300;
  let bulletinShouldFail = false;
  let getBulletinCallCount = 0;

  await page.route('**/*exec*', async route => {
    const postData = route.request().postData() || '';
    let action = '';
    try {
      const parsed = JSON.parse(postData);
      action = parsed.action;
    } catch(e) {}

    if (action === 'getBulletinPosts') {
      getBulletinCallCount++;
      if (bulletinDelayMs > 0) {
        await new Promise(r => setTimeout(r, bulletinDelayMs));
      }
      if (bulletinShouldFail) {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Simulated Network Error' })
        });
        return;
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          posts: [
            { updatedAt: '2026/09/21 12:00', staffId: 'U002', staffName: 'リーダーB', message: '雨天のため滑りやすい箇所に注意してください' },
            { updatedAt: '2026/09/21 11:30', staffId: 'U003', staffName: 'スタッフC', message: '北区画のチラシ在庫補充完了しました' }
          ]
        })
      });
      return;
    }

    if (action === 'getRanking') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, ranking: [] })
      });
      return;
    }

    if (action === 'getFlyerStock') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, stocks: [] })
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });

  // アプリを開く
  await page.goto(`http://localhost:${PORT}/app/index.html`);
  await page.waitForLoadState('networkidle');

  // LINE ログイン初期化完了まで待機
  await page.waitForFunction(() => typeof window.switchPage === 'function');

  const testResults = {};

  // Helper: 掲示板コンテナの検査
  async function inspectBulletin() {
    return await page.evaluate(() => {
      const c = document.getElementById('bulletin-list-container');
      const text = c ? c.innerText : '';
      const html = c ? c.innerHTML : '';
      const hasLoading = text.toUpperCase().includes('LOADING BULLETIN');
      const hasPosts = html.includes('bulletin-row') || text.includes('注意してください') || text.includes('現在、他の配布員からの');
      const hasError = text.includes('失敗') || text.includes('エラー') || text.includes('タイムアウト');
      return { hasLoading, hasPosts, hasError, text: text.trim() };
    });
  }

  // --------------------------------------------------------------------------
  // Case A: 掲示板初回表示
  // --------------------------------------------------------------------------
  console.log("▶ [Case A] 掲示板初回表示中...");
  await page.evaluate(() => window.switchPage('bulletin'));
  await page.waitForTimeout(600); // 通信完了を待機
  const resA = await inspectBulletin();
  testResults.caseA = (!resA.hasLoading && resA.hasPosts);
  console.log(`  Case A Result: PASS=${testResults.caseA} (Loading=${resA.hasLoading}, Posts=${resA.hasPosts})`);

  // --------------------------------------------------------------------------
  // Case B: 掲示板 → エリア → 掲示板
  // --------------------------------------------------------------------------
  console.log("\n▶ [Case B] 掲示板 → エリア → 掲示板...");
  await page.evaluate(() => window.switchPage('areas'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.switchPage('bulletin'));
  // 復帰直後にLoadingが出ず、即座に投稿一覧が表示されているか
  const resB_immediate = await inspectBulletin();
  await page.waitForTimeout(500);
  const resB_settled = await inspectBulletin();
  testResults.caseB = (!resB_immediate.hasLoading && resB_immediate.hasPosts && !resB_settled.hasLoading);
  console.log(`  Case B Result: PASS=${testResults.caseB} (ImmediateLoading=${resB_immediate.hasLoading}, Posts=${resB_immediate.hasPosts})`);

  // --------------------------------------------------------------------------
  // Case C: 掲示板 → ランキング → 掲示板
  // --------------------------------------------------------------------------
  console.log("\n▶ [Case C] 掲示板 → ランキング → 掲示板...");
  await page.evaluate(() => window.switchPage('ranking'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.switchPage('bulletin'));
  const resC = await inspectBulletin();
  testResults.caseC = (!resC.hasLoading && resC.hasPosts);
  console.log(`  Case C Result: PASS=${testResults.caseC} (Loading=${resC.hasLoading}, Posts=${resC.hasPosts})`);

  // --------------------------------------------------------------------------
  // Case D: 掲示板 → 在庫 → 掲示板
  // --------------------------------------------------------------------------
  console.log("\n▶ [Case D] 掲示板 → 在庫 (storage-list) → 掲示板...");
  await page.evaluate(() => window.switchPage('storage-list'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.switchPage('bulletin'));
  const resD = await inspectBulletin();
  testResults.caseD = (!resD.hasLoading && resD.hasPosts);
  console.log(`  Case D Result: PASS=${testResults.caseD} (Loading=${resD.hasLoading}, Posts=${resD.hasPosts})`);

  // --------------------------------------------------------------------------
  // Case E: 掲示板 → 設定 → 掲示板
  // --------------------------------------------------------------------------
  console.log("\n▶ [Case E] 掲示板 → 設定 → 掲示板...");
  await page.evaluate(() => window.switchPage('settings'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.switchPage('bulletin'));
  const resE = await inspectBulletin();
  testResults.caseE = (!resE.hasLoading && resE.hasPosts);
  console.log(`  Case E Result: PASS=${testResults.caseE} (Loading=${resE.hasLoading}, Posts=${resE.hasPosts})`);

  // --------------------------------------------------------------------------
  // Case F: 上記画面遷移を5回以上連続
  // --------------------------------------------------------------------------
  console.log("\n▶ [Case F] 画面遷移を5回以上連続実行...");
  let caseF_allPass = true;
  for (let i = 1; i <= 6; i++) {
    const target = (i % 2 === 0) ? 'areas' : 'ranking';
    await page.evaluate((t) => window.switchPage(t), target);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.switchPage('bulletin'));
    await page.waitForTimeout(150);
    const r = await inspectBulletin();
    if (r.hasLoading || !r.hasPosts) {
      caseF_allPass = false;
      console.error(`  Iteration ${i} failed: Loading=${r.hasLoading}, Posts=${r.hasPosts}`);
    }
  }
  testResults.caseF = caseF_allPass;
  console.log(`  Case F Result: PASS=${testResults.caseF} (6 consecutive transitions clean)`);

  // --------------------------------------------------------------------------
  // Case G: 掲示板表示中に高速で別画面へ移動して戻る
  // --------------------------------------------------------------------------
  console.log("\n▶ [Case G] 掲示板表示中に高速で別画面へ移動して戻る...");
  bulletinDelayMs = 1000; // 遅延を長めに設定
  // 掲示板へ切り替え要求直後、レスポンスが戻る前に別画面へ即座に退避
  page.evaluate(() => window.switchPage('bulletin'));
  await page.waitForTimeout(50);
  await page.evaluate(() => window.switchPage('areas'));
  await page.waitForTimeout(1200); // 以前のリクエストが解決するまで別画面で待つ
  // その後、掲示板に戻る
  await page.evaluate(() => window.switchPage('bulletin'));
  await page.waitForTimeout(200);
  const resG = await inspectBulletin();
  testResults.caseG = (!resG.hasLoading && resG.hasPosts);
  console.log(`  Case G Result: PASS=${testResults.caseG} (Loading=${resG.hasLoading}, Posts=${resG.hasPosts})`);

  // 正常通信時のコンソールエラー数を記録
  const normalConsoleErrors = [...consoleErrors];

  // --------------------------------------------------------------------------
  // Case H: 通信遅延/失敗時のエラー表示
  // --------------------------------------------------------------------------
  console.log("\n▶ [Case H] 通信遅延/失敗時のエラー表示 & キャッシュ保護...");
  bulletinShouldFail = true;
  bulletinDelayMs = 50;
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => typeof window.switchPage === 'function');

  // 掲示板へ移動
  await page.evaluate(() => window.switchPage('bulletin'));
  await page.waitForFunction(() => {
    const c = document.getElementById('bulletin-list-container');
    return c && (c.innerText.includes('失敗') || c.innerText.includes('エラー') || c.innerText.includes('タイムアウト'));
  }, { timeout: 8000 });

  const resH_fail = await inspectBulletin();
  const hasErrorUI = resH_fail.hasError && !resH_fail.hasLoading;

  // 通信を復旧して再試行ボタンをクリック
  bulletinShouldFail = false;
  await page.evaluate(() => {
    const btn = document.querySelector('#bulletin-list-container button');
    if (btn) btn.click();
  });
  await page.waitForFunction(() => {
    const c = document.getElementById('bulletin-list-container');
    return c && (c.innerHTML.includes('bulletin-row') || c.innerText.includes('注意してください'));
  }, { timeout: 5000 });

  const resH_recovered = await inspectBulletin();
  const isRecovered = !resH_recovered.hasLoading && resH_recovered.hasPosts;

  testResults.caseH = (hasErrorUI && isRecovered);
  console.log(`  Case H Result: PASS=${testResults.caseH} (ErrorUI=${hasErrorUI}, Recovered=${isRecovered})`);

  // 終了処理
  await browser.close();
  server.close();

  const allCasesPassed = (
    testResults.caseA &&
    testResults.caseB &&
    testResults.caseC &&
    testResults.caseD &&
    testResults.caseE &&
    testResults.caseF &&
    testResults.caseG &&
    testResults.caseH &&
    normalConsoleErrors.length === 0
  );

  console.log("\n===============================================================");
  console.log(`📊 E2E BROWSER AUDIT VERDICT: ${allCasesPassed ? "🎉 ALL CASES (A-H) PASSED" : "❌ E2E FAILED"}`);
  console.log(`  Normal Operations Console Errors: ${normalConsoleErrors.length}`);
  if (normalConsoleErrors.length > 0) {
    console.log("  Errors detail:", normalConsoleErrors);
  }
  console.log("===============================================================");

  return allCasesPassed;
}

runBulletinE2ETests().then(passed => {
  if (!passed) process.exit(1);
});
