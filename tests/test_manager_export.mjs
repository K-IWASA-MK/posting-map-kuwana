import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

console.log("====================================================");
console.log("📊 GATE 1: DEDICATED EXPORT ENGINE UNIT TEST");
console.log("====================================================");

// ----------------------------------------------------
// 1. HTML ローダー静的契約検証 (Ordered Dynamic Scripts)
// ----------------------------------------------------
console.log("\n▶ Testing 1. HTML Loader Static Contract (Ordered Dynamic Scripts)...");
const htmlPath = path.resolve('active/manager/index.html');
const indexHtml = fs.readFileSync(htmlPath, 'utf8');

// スクリプトブロックの抽出
const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>[\s\n]*<\/body>/i);
assert.ok(scriptMatch, 'index.html body末尾にscriptタグが存在すること');
const scriptContent = scriptMatch[1];

// 契約項目の静的検証
assert.ok(scriptContent.includes('manager-export.js'), 'manager-export.js が読み込まれていること');
assert.ok(scriptContent.includes('manager.js'), 'manager.js が読み込まれていること');
assert.ok(/sExport\.async\s*=\s*false/.test(scriptContent), 'sExport.async = false が設定されていること');
assert.ok(/s\.async\s*=\s*false/.test(scriptContent), 's.async = false が設定されていること');

const exportAppendIdx = scriptContent.indexOf('appendChild(sExport)');
const managerAppendIdx = scriptContent.indexOf('appendChild(s)');
assert.ok(exportAppendIdx > -1, 'appendChild(sExport) が存在すること');
assert.ok(managerAppendIdx > -1, 'appendChild(s) が存在すること');
assert.ok(exportAppendIdx < managerAppendIdx, 'sExport が s よりも先行して appendChild される順序契約を満たすこと');
console.log("  ✅ Loader contract passed: sExport -> s with async=false.");

// ----------------------------------------------------
// 2. manager-export.js モジュール評価と Global Exposure
// ----------------------------------------------------
console.log("\n▶ Testing 2. manager-export.js Module Evaluation & 5 Globals...");
const exportJsPath = path.resolve('active/manager/manager-export.js');
const exportJsContent = fs.readFileSync(exportJsPath, 'utf8');

// 禁止パターンの静的検査 ('use strict', typeof window guard)
assert.ok(!exportJsContent.includes("'use strict'"), "'use strict' が含まれていないこと");
assert.ok(!exportJsContent.includes('"use strict"'), '"use strict" が含まれていないこと');
assert.ok(!exportJsContent.includes("typeof window === 'undefined'"), "typeof window guard が含まれていないこと");

// ブラウザ環境モックの作成
let alertMessages = [];
let appendedElements = [];
let removedElements = [];
let createdUrls = [];
let revokedUrls = [];

const createMockElement = (tagName) => {
  const el = {
    tagName: tagName.toUpperCase(),
    style: {},
    attributes: {},
    setAttribute: (k, v) => { el.attributes[k] = v; },
    getAttribute: (k) => el.attributes[k],
    contentWindow: {
      document: {
        open: () => {},
        write: (h) => { el.writtenHtml = h; },
        close: () => {}
      },
      focus: () => { el.focused = true; },
      print: () => { el.printed = true; }
    },
    click: () => { el.clicked = true; }
  };
  return el;
};

const mockWindow = {
  location: { origin: 'https://kuwana.posting-map.jp' },
  alert: (msg) => { alertMessages.push(msg); }
};

const mockDocument = {
  body: {
    appendChild: (el) => { appendedElements.push(el); return el; },
    removeChild: (el) => { removedElements.push(el); },
    contains: (el) => appendedElements.includes(el)
  },
  createElement: (tagName) => createMockElement(tagName)
};

class MockBlob {
  constructor(parts, options) {
    this.parts = parts;
    this.options = options;
  }
}

const mockURL = {
  createObjectURL: (blob) => {
    const url = 'blob:https://kuwana.posting-map.jp/' + Math.random().toString(36).substring(2);
    createdUrls.push({ url, blob });
    return url;
  },
  revokeObjectURL: (url) => {
    revokedUrls.push(url);
  }
};

const sandbox = {
  window: mockWindow,
  document: mockDocument,
  Blob: MockBlob,
  URL: mockURL,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  setTimeout: setTimeout,
  alert: (msg) => mockWindow.alert(msg)
};
mockWindow.window = mockWindow;

const context = vm.createContext(sandbox);
vm.runInContext(exportJsContent, context);

// 5大グローバル公開の検証
assert.equal(typeof sandbox.window.generateRecordsReportPdfHtml, 'function', 'window.generateRecordsReportPdfHtml が存在すること');
assert.equal(typeof sandbox.window.downloadRecordsReportPdf, 'function', 'window.downloadRecordsReportPdf が存在すること');
assert.equal(typeof sandbox.window.formatCsvField, 'function', 'window.formatCsvField が存在すること');
assert.equal(typeof sandbox.window.generateRecordsCsv, 'function', 'window.generateRecordsCsv が存在すること');
assert.equal(typeof sandbox.window.downloadRecordsCsv, 'function', 'window.downloadRecordsCsv が存在すること');
console.log("  ✅ 5 Globals successfully exposed to window.");

// ----------------------------------------------------
// 3. formatCsvField 単体テスト
// ----------------------------------------------------
console.log("\n▶ Testing 3. formatCsvField Unit Verification...");
const { formatCsvField } = sandbox.window;
assert.equal(formatCsvField(null), '""', 'null -> ""');
assert.equal(formatCsvField(undefined), '""', 'undefined -> ""');
assert.equal(formatCsvField('普通文字列'), '"普通文字列"', '通常文字列');
assert.equal(formatCsvField('カンマ,あり'), '"カンマ,あり"', 'カンマを含む');
assert.equal(formatCsvField('ダブル"クォート'), '"ダブル""クォート"', 'ダブルクォートのエスケープ');
assert.equal(formatCsvField('改行\nあり'), '"改行\nあり"', '改行を含む');
console.log("  ✅ formatCsvField passed all tests.");

// ----------------------------------------------------
// 4. generateRecordsReportPdfHtml テスト
// ----------------------------------------------------
console.log("\n▶ Testing 4. generateRecordsReportPdfHtml Verification...");
const { generateRecordsReportPdfHtml } = sandbox.window;

// 空データテスト
const emptyPdfHtml = generateRecordsReportPdfHtml({});
assert.ok(emptyPdfHtml.includes('@page {'), 'CSS @page 定義が存在すること');
assert.ok(emptyPdfHtml.includes('size: A4 portrait;'), 'A4 portrait 指定が存在すること');
assert.ok(emptyPdfHtml.includes('【支部】配布実績報告書'), 'デフォルト支部名フォールバック');
assert.ok(emptyPdfHtml.includes('登録データはありません'), '名簿空データメッセージ');
assert.ok(emptyPdfHtml.includes('配布実績データはありません'), '実績空データメッセージ');
assert.ok(emptyPdfHtml.includes('ランキングデータはありません'), 'ランキング空データメッセージ');
assert.ok(emptyPdfHtml.includes('保有チラシデータはありません'), '保有チラシ空データメッセージ');

// 実データ投入テスト
const testState = {
  summary: {
    districtName: "桑名支部",
    completedPins: 15,
    totalPins: 100,
    unassignedPins: 75,
    inProgressPins: 10,
    totalPostings: 5400,
    totalStockCount: 2100,
    rosterCount: 3
  },
  roster: [
    { id: "S-01", name: "<桑名> 太郎", stockTotal: 600, deliveredTotal: 1800 },
    { id: "S-02", name: "未登録", stockTotal: 0, deliveredTotal: 0 }
  ],
  ranking: [
    { rank: 1, staffId: "S-01", name: "<桑名> 太郎", count: 1800, completedAreas: 5, hasGps: true, hasPhoto: true }
  ],
  stocks: [
    { staffId: "S-01", staffName: "<桑名> 太郎", count: 600, pendingRequestsCount: 2, updatedAt: "2026/10/10 10:30" }
  ],
  liveRecords: [
    { time: "10:30", cityName: "桑名市", townName: "大字桑名", count: 200, staffId: "S-01", gpsStatus: "OK", photoStatus: "OK" }
  ]
};

const fullPdfHtml = generateRecordsReportPdfHtml(testState);
assert.ok(fullPdfHtml.includes('【桑名支部】配布実績報告書'), '支部名が反映されていること');
assert.ok(fullPdfHtml.includes('https://kuwana.posting-map.jp/active/h-app/assets/icon180-v2.png'), 'ロゴ画像URLがorigin付きで反映されていること');
assert.ok(fullPdfHtml.includes('15 <span class="sub">/ 100</span>'), '配布状況サマリー');
assert.ok(fullPdfHtml.includes('5,400 <span class="unit">枚</span>'), '配布実績枚数サマリー');
assert.ok(fullPdfHtml.includes('&lt;桑名&gt; 太郎'), 'escapeHtml によるサニタイズが適用されていること');
assert.ok(fullPdfHtml.includes('1、登録者一覧'), 'セクション1ヘッダー');
assert.ok(fullPdfHtml.includes('2、配布実績'), 'セクション2ヘッダー');
assert.ok(fullPdfHtml.includes('3、ランキング'), 'セクション3ヘッダー');
assert.ok(fullPdfHtml.includes('4、保有チラシ'), 'セクション4ヘッダー');
console.log("  ✅ generateRecordsReportPdfHtml passed all tests.");

// ----------------------------------------------------
// 5. generateRecordsCsv テスト
// ----------------------------------------------------
console.log("\n▶ Testing 5. generateRecordsCsv Verification...");
const { generateRecordsCsv } = sandbox.window;

// 空データテスト
const emptyCsv = generateRecordsCsv({});
assert.ok(emptyCsv.startsWith('\uFEFF'), 'UTF-8 BOM が先頭に付与されていること');
assert.ok(emptyCsv.includes('"【支部】配布実績データ"'), 'デフォルト支部名フォールバック');
assert.ok(emptyCsv.includes('"(データなし)"'), '空データ行');

// 実データ投入テスト
const fullCsv = generateRecordsCsv(testState);
assert.ok(fullCsv.startsWith('\uFEFF'), 'UTF-8 BOM が先頭に付与されていること');
assert.ok(fullCsv.includes('\r\n'), 'CRLF 改行コードで結合されていること');
assert.ok(fullCsv.includes('"【桑名支部】配布実績データ"'), '支部名');
assert.ok(fullCsv.includes('"1、登録者一覧"'), 'セクション1');
assert.ok(fullCsv.includes('"S-01","<桑名> 太郎","600 枚","1,800 枚"'), '名簿データ行');
assert.ok(fullCsv.includes('"2、配布実績"'), 'セクション2');
assert.ok(fullCsv.includes('"桑名市 大字桑名","200 枚","S-01","OK","OK"'), '実績データ行');
assert.ok(fullCsv.includes('"3、ランキング"'), 'セクション3');
assert.ok(fullCsv.includes('"1","S-01","<桑名> 太郎","1,800 枚","5","OK","OK"'), 'ランキングデータ行');
assert.ok(fullCsv.includes('"4、保有チラシ"'), 'セクション4');
assert.ok(fullCsv.includes('"S-01","<桑名> 太郎","600 枚","2 件","10/10 10:30"'), '保有チラシデータ行');
console.log("  ✅ generateRecordsCsv passed all tests.");

// ----------------------------------------------------
// 6. Failure Path: DashboardState 未定義時のガードテスト
// ----------------------------------------------------
console.log("\n▶ Testing 6. Failure Path (DashboardState undefined)...");
const { downloadRecordsReportPdf, downloadRecordsCsv } = sandbox.window;

// DashboardState が定義されていない状態
alertMessages = [];
delete sandbox.DashboardState;
delete sandbox.window.DashboardState;

downloadRecordsReportPdf();
assert.equal(alertMessages.length, 1, 'alert が1回呼ばれること');
assert.equal(alertMessages[0], 'ダッシュボードの状態を読み込めませんでした。', '正しいアラートメッセージ');
assert.equal(appendedElements.length, 0, 'iframe が追加されていないこと');

alertMessages = [];
downloadRecordsCsv();
assert.equal(alertMessages.length, 1, 'alert が1回呼ばれること');
assert.equal(alertMessages[0], 'ダッシュボードの状態を読み込めませんでした。', '正しいアラートメッセージ');
assert.equal(createdUrls.length, 0, 'Blob URL が生成されていないこと');
console.log("  ✅ Failure paths safely aborted with alert.");

// ----------------------------------------------------
// 7. Success Path: Browser I/O 実行テスト
// ----------------------------------------------------
console.log("\n▶ Testing 7. Success Path Browser I/O Execution...");
sandbox.DashboardState = testState;
sandbox.window.DashboardState = testState;

// PDF ダウンロード (iframe 作成, write, focus, print)
appendedElements = [];
downloadRecordsReportPdf();
assert.equal(appendedElements.length, 1, 'iframe が body に appendChild されたこと');
const iframe = appendedElements[0];
assert.equal(iframe.tagName, 'IFRAME', '追加された要素が IFRAME であること');
assert.ok(iframe.writtenHtml.includes('【桑名支部】配布実績報告書'), 'iframe doc に HTML が書き込まれたこと');
assert.equal(iframe.focused, true, 'iframe contentWindow.focus() が実行されたこと');
console.log("  ✅ downloadRecordsReportPdf created and primed iframe.");

// CSV ダウンロード (Blob, a tag, click, revoke)
appendedElements = [];
removedElements = [];
createdUrls = [];
revokedUrls = [];

downloadRecordsCsv();
assert.equal(createdUrls.length, 1, 'Blob URL が生成されたこと');
assert.equal(appendedElements.length, 1, 'a link が body に appendChild されたこと');
const link = appendedElements[0];
assert.equal(link.tagName, 'A', '追加された要素が A タグであること');
assert.ok(link.attributes.download.includes('桑名支部_配布実績_'), 'download 属性にファイル名が正しく設定されたこと');
assert.equal(link.clicked, true, 'link.click() が実行されたこと');
assert.equal(removedElements.length, 1, 'link が body から removeChild されたこと');
assert.equal(revokedUrls.length, 1, 'URL.revokeObjectURL が実行されたこと');
console.log("  ✅ downloadRecordsCsv created Blob and triggered download.");

console.log("\n====================================================");
console.log("🎉 ALL GATE 1 DEDICATED EXPORT TESTS PASSED (100%)!");
console.log("====================================================");
