/**
 * test_multi_district_routing_auth.mjs
 * 親Standalone GAS 1本化・動的地区ルーティング & 認可境界 厳格検証テストスイート
 *
 * MASTER確定仕様:
 * 1. currentDistrictId のSingleton状態保持を排除（リクエストスコープ伝播）。
 * 2. districtId なしの本番マルチ地区APIはデフォルトSpreadsheetへ無条件fallbackさせない (MISSING_DISTRICT_ID)。
 * 3. SYSTEM_INFO の機械的照合値は「地区コード（B2）」とし、不一致時は DISTRICT_MISMATCH で遮断。
 * 4. DISTRICT_REGISTRY は「地区DB接続情報」のSSOT。
 * 5. SYSTEM_INFO は接続先DB自身の地区情報・契約状態等のSSOT。
 * 6. 5大認可シナリオ（正当、越境、未登録、無効トークン、未知地区ID）の全数実証。
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

console.log('================================================================');
console.log('🧪 MULTI-DISTRICT DYNAMIC ROUTING & AUTH BOUNDARY VERIFICATION');
console.log('================================================================\n');

// 決定論的 Fixed Clock: 実カレンダーからテストを切り離し、基準Fixture月 2026-09 を保証
const baseOriginalDate = global.Date;
const mockSeptDate = new baseOriginalDate("2026-09-20T12:00:00+09:00");
class MockDate202609 extends baseOriginalDate {
  constructor(...args) {
    if (args.length === 0) {
      super(mockSeptDate.getTime());
    } else {
      super(...args);
    }
  }
  static now() {
    return mockSeptDate.getTime();
  }
}
global.Date = MockDate202609;

// 1. スプレッドシートモック
class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
  }
  getLastRow() {
    return this.rows.length;
  }
  getLastColumn() {
    return this.rows.length > 0 ? this.rows[0].length : 0;
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    const sheet = this;
    return {
      getValues() {
        const res = [];
        for (let r = 0; r < numRows; r++) {
          const rowIdx = row - 1 + r;
          const rowData = sheet.rows[rowIdx] || [];
          const rowVals = [];
          for (let c = 0; c < numCols; c++) {
            const colIdx = col - 1 + c;
            rowVals.push(rowData[colIdx] !== undefined ? rowData[colIdx] : "");
          }
          res.push(rowVals);
        }
        return res;
      },
      setValues(vals) {
        for (let r = 0; r < vals.length; r++) {
          const rowIdx = row - 1 + r;
          if (!sheet.rows[rowIdx]) {
            sheet.rows[rowIdx] = [];
          }
          for (let c = 0; c < vals[r].length; c++) {
            const colIdx = col - 1 + c;
            sheet.rows[rowIdx][colIdx] = vals[r][c];
          }
        }
      },
      setValue(val) {
        const rowIdx = row - 1;
        const colIdx = col - 1;
        if (!sheet.rows[rowIdx]) {
          sheet.rows[rowIdx] = [];
        }
        sheet.rows[rowIdx][colIdx] = val;
      }
    };
  }
  appendRow(row) {
    this.rows.push(row);
  }
}

class MockSpreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sheets = {};
  }
  getId() {
    return this.id;
  }
  getName() {
    return this.name;
  }
  getSheetByName(name) {
    return this.sheets[name] || null;
  }
  addSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets[name] = sheet;
    return sheet;
  }
  insertSheet(name) {
    return this.addSheet(name);
  }
}

// 2. モック環境の構築
const mockSpreadsheets = {};
const mockScriptProperties = {};

class MockCache {
  constructor() {
    this.store = new Map();
  }
  get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  put(key, value, ttl) {
    this.store.set(key, String(value));
  }
  remove(key) {
    this.store.delete(key);
  }
}
const mockCache = new MockCache();

global.CacheService = {
  getScriptCache() {
    return mockCache;
  }
};

global.PropertiesService = {
  getScriptProperties() {
    return {
      getProperty(key) {
        return mockScriptProperties[key] || null;
      },
      setProperty(key, val) {
        mockScriptProperties[key] = String(val);
      },
      setProperties(obj) {
        for (const [k, v] of Object.entries(obj)) {
          mockScriptProperties[k] = String(v);
        }
      }
    };
  }
};

global.DriveApp = {
  getFolderById(id) {
    return {
      getId() { return id; }
    };
  }
};

global.LockService = {
  getScriptLock: () => ({
    waitLock: () => {},
    releaseLock: () => {}
  })
};

global.Utilities = {
  computeDigest(algo, str) {
    return Array.from(crypto.createHash('sha256').update(str).digest());
  },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  formatDate(d, tz, fmt) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (fmt === 'yyyy-MM') return `${year}-${month}`;
    if (fmt === 'yyyy-MM-dd') return `${year}-${month}-${day}`;
    if (fmt && fmt.includes('HH:mm:ss')) {
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${year}/${month}/${day} ${h}:${m}:${s}`;
    }
    return `${year}-${month}-${day}`;
  }
};

let openByIdCallCount = 0;

global.SpreadsheetApp = {
  openById(id) {
    openByIdCallCount++;
    if (mockSpreadsheets[id]) {
      return mockSpreadsheets[id];
    }
    throw new Error(`Spreadsheet not found for ID: ${id}`);
  },
  getActiveSpreadsheet() {
    return null;
  },
  flush() {}
};

global.ContentService = {
  MimeType: { JSON: "application/json" },
  createTextOutput(text) {
    return {
      text: text,
      mimeType: "application/json",
      setMimeType(m) { this.mimeType = m; return this; }
    };
  }
};

// 3. スプレッドシート作成
const currentMonth = "2026-09";
const staffSheetName = "名簿" + currentMonth;
const distSheetName = "配布実績" + currentMonth;

// (1) KUWANA DB
const kuwanaSS = new MockSpreadsheet("ss-kuwana-id", "POSTING_MAP_KUWANA");
const kuwanaSysInfo = kuwanaSS.addSheet("SYSTEM_INFO");
kuwanaSysInfo.rows = [
  ["項目", "設定値"],
  ["地区コード", "KUWANA"],
  ["地区名", "桑名地区"],
  ["管理パスワード", "pwd_kuwana"],
  ["契約終了日", "2026-10-31"]
];
const kuwanaStaff = kuwanaSS.addSheet(staffSheetName);
kuwanaStaff.rows = [
  ["STAFF_ID", "氏名", "LINE_USER_ID", "登録日時"],
  ["K001", "桑名 太郎", "U_KUWANA_001", "2026/01/01"],
  ["K002", "桑名 花子", "U_KUWANA_002", "2026/01/01"]
];
const kuwanaDist = kuwanaSS.addSheet(distSheetName);
kuwanaDist.rows = [
  ["rowId", "cityName", "townName", "completedAt", "count", "staffId", "staffName", "", "", "", "", "", "", "", "", "lineUserId"],
  ["1", "桑名市", "中央町1", "2026/09/20", 100, "K001", "桑名 太郎", "", "", "", "", "", "", "", "", "U_KUWANA_001"]
];
mockSpreadsheets["ss-kuwana-id"] = kuwanaSS;

// (2) OKAYAMA DB
const okayamaSS = new MockSpreadsheet("ss-okayama-id", "POSTING_MAP_OKAYAMA");
const okayamaSysInfo = okayamaSS.addSheet("SYSTEM_INFO");
okayamaSysInfo.rows = [
  ["項目", "設定値"],
  ["地区コード", "OKAYAMA"],
  ["地区名", "岡山地区"],
  ["管理パスワード", "pwd_okayama"],
  ["契約終了日", "2026-10-31"]
];
const okayamaStaff = okayamaSS.addSheet(staffSheetName);
okayamaStaff.rows = [
  ["STAFF_ID", "氏名", "LINE_USER_ID", "登録日時"],
  ["O001", "岡山 次郎", "U_OKAYAMA_001", "2026/01/01"]
];
const okayamaDist = okayamaSS.addSheet(distSheetName);
okayamaDist.rows = [
  ["rowId", "cityName", "townName", "completedAt", "count", "staffId", "staffName", "", "", "", "", "", "", "", "", "lineUserId"],
  ["1", "岡山市", "北区1", "2026/09/20", 250, "O001", "岡山 次郎", "", "", "", "", "", "", "", "", "U_OKAYAMA_001"]
];
mockSpreadsheets["ss-okayama-id"] = okayamaSS;

// (3) 不整合スプレッドシート（B2が不正な値）
const mismatchSS = new MockSpreadsheet("ss-mismatch-id", "POSTING_MAP_MISMATCH");
const mismatchSysInfo = mismatchSS.addSheet("SYSTEM_INFO");
mismatchSysInfo.rows = [
  ["項目", "設定値"],
  ["地区コード", "CORRUPTED_CODE"],
  ["地区名", "桑名地区"]
];
mockSpreadsheets["ss-mismatch-id"] = mismatchSS;

// 4. DISTRICT_REGISTRY の設定
PropertiesService.getScriptProperties().setProperty("DISTRICT_REGISTRY", JSON.stringify({
  "KUWANA": "ss-kuwana-id",
  "OKAYAMA": "ss-okayama-id",
  "MISMATCH_DISTRICT": "ss-mismatch-id"
}));

// 5. ソースコードの読み込みと評価
const rootDir = process.cwd();
const adapterCode = fs.readFileSync(path.join(rootDir, 'active/infrastructure/spreadsheet/spreadsheet_adapter.js'), 'utf-8');
const monthlyResolverCode = fs.readFileSync(path.join(rootDir, 'active/business/system/monthly_sheet_resolver.js'), 'utf-8');
import vm from 'node:vm';

const staffModelCode = fs.readFileSync(path.join(rootDir, 'active/business/staff/staff_model.js'), 'utf-8');
const staffRepoCode = fs.readFileSync(path.join(rootDir, 'active/business/staff/staff_repository.js'), 'utf-8');
const staffServiceCode = fs.readFileSync(path.join(rootDir, 'active/business/staff/staff_service.js'), 'utf-8');
const systemInfoCode = fs.readFileSync(path.join(rootDir, 'active/business/system/system_info_service.js'), 'utf-8');
const systemSummaryCode = fs.readFileSync(path.join(rootDir, 'active/business/system/system_summary_service.js'), 'utf-8');
const distRepoCode = fs.readFileSync(path.join(rootDir, 'active/business/distribution/distribution_repository.js'), 'utf-8');
const distServiceCode = fs.readFileSync(path.join(rootDir, 'active/business/distribution/distribution_service.js'), 'utf-8');
const v2ApiCode = fs.readFileSync(path.join(rootDir, 'active/api/v2_api.js'), 'utf-8');

// 依存モジュールロード
vm.runInThisContext(adapterCode);
vm.runInThisContext(monthlyResolverCode);
vm.runInThisContext(systemInfoCode);
vm.runInThisContext(staffModelCode);
vm.runInThisContext(staffRepoCode);
vm.runInThisContext(staffServiceCode);
vm.runInThisContext(systemSummaryCode);
vm.runInThisContext(distRepoCode);
vm.runInThisContext(distServiceCode);

// LINE 認証検証のモック（テスト用）
global.authenticateRequest = function(payload) {
  if (!payload || !payload.liffToken) {
    return { success: false, message: "Unauthorized: Missing liffToken" };
  }
  const token = payload.liffToken;
  if (token === "token_kuwana_user1") {
    return { success: true, user: { lineUserId: "U_KUWANA_001", displayName: "桑名 太郎" } };
  }
  if (token === "token_kuwana_user2") {
    return { success: true, user: { lineUserId: "U_KUWANA_002", displayName: "桑名 花子" } };
  }
  if (token === "token_okayama_user1") {
    return { success: true, user: { lineUserId: "U_OKAYAMA_001", displayName: "岡山 次郎" } };
  }
  if (token === "token_unknown_user") {
    return { success: true, user: { lineUserId: "U_STRANGER_999", displayName: "見知らぬ人" } };
  }
  if (typeof token === 'string' && token.startsWith("token_custom_")) {
    const suffix = token.replace("token_custom_", "");
    return { success: true, user: { lineUserId: `U_CUSTOM_${suffix}`, displayName: `カスタム_${suffix}` } };
  }
  return { success: false, message: "Unauthorized: Invalid or expired liffToken" };
};

global.verifyLineToken = function(token) {
  if (token === "token_kuwana_user1") return { success: true, lineUserId: "U_KUWANA_001" };
  if (token === "token_kuwana_user2") return { success: true, lineUserId: "U_KUWANA_002" };
  if (token === "token_okayama_user1") return { success: true, lineUserId: "U_OKAYAMA_001" };
  if (token === "token_unknown_user") return { success: true, lineUserId: "U_STRANGER_999" };
  if (typeof token === 'string' && token.startsWith("token_custom_")) {
    const suffix = token.replace("token_custom_", "");
    return { success: true, lineUserId: `U_CUSTOM_${suffix}` };
  }
  return { success: false, code: "INVALID_TOKEN", message: "Token verification failed" };
};

vm.runInThisContext(v2ApiCode);

// =============================================================================
// テスト実行
// =============================================================================

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// TEST 1: 正当アクセス (User A in KUWANA -> KUWANA DB)
// -----------------------------------------------------------------------------
runTest("Scenario 1: 正当アクセス (KUWANA所属スタッフがKUWANAを指定)", () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        action: "getStaffIdentity",
        liffToken: "token_kuwana_user1",
        districtId: "KUWANA"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);
  assert.equal(data.success, true);
  assert.equal(data.registered, true);
  assert.equal(data.staffId, "K001");
  assert.equal(data.staffName, "桑名 太郎");
});

// -----------------------------------------------------------------------------
// TEST 2: 越境アクセス拒否 (User A in KUWANA -> OKAYAMA DB 指定)
// -----------------------------------------------------------------------------
runTest("Scenario 2: 越境アクセス拒否 (KUWANA所属スタッフがOKAYAMA DBへアクセス)", () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        action: "getStaffIdentity",
        liffToken: "token_kuwana_user1",
        districtId: "OKAYAMA"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);
  assert.equal(data.success, true);
  assert.equal(data.registered, false);
  assert.equal(data.code, "NOT_REGISTERED");
});

// -----------------------------------------------------------------------------
// TEST 3: 未登録ユーザー拒否 (Unknown User -> KUWANA DB)
// -----------------------------------------------------------------------------
runTest("Scenario 3: 未登録ユーザー拒否 (どの地区名簿にも存在しないLINEユーザー)", () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        action: "getStaffIdentity",
        liffToken: "token_unknown_user",
        districtId: "KUWANA"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);
  assert.equal(data.success, true);
  assert.equal(data.registered, false);
  assert.equal(data.code, "NOT_REGISTERED");
});

// -----------------------------------------------------------------------------
// TEST 4: 無効トークン拒否 (Invalid Token)
// -----------------------------------------------------------------------------
runTest("Scenario 4: 無効トークン拒否 (期限切れまたは偽装トークン)", () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        action: "getStaffIdentity",
        liffToken: "fake_expired_token",
        districtId: "KUWANA"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);
  assert.equal(data.success, false);
  assert.match(data.message, /Unauthorized/);
});

// -----------------------------------------------------------------------------
// TEST 5: 未知地区ID拒否 (Unknown districtId)
// -----------------------------------------------------------------------------
runTest("Scenario 5: 未知地区ID拒否 (DISTRICT_REGISTRYに存在しない地区ID)", () => {
  assert.throws(() => {
    SpreadsheetResolver.getInstance().getSpreadsheet("UNKNOWN_DISTRICT");
  }, /not found in DISTRICT_REGISTRY/);
});

// -----------------------------------------------------------------------------
// TEST 6: マルチ地区環境での districtId 欠落拒否 (無条件fallback遮断)
// -----------------------------------------------------------------------------
runTest("Scenario 6: districtId欠落遮断 (マルチ地区環境でdistrictId未指定の業務API)", () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        action: "getStaffIdentity",
        liffToken: "token_kuwana_user1"
        // districtId 未指定
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);
  assert.equal(data.success, false);
  assert.equal(data.code, "MISSING_DISTRICT_ID");
});

// -----------------------------------------------------------------------------
// TEST 7: 二段階SSOT・Integrity Guard 検証 (B2 地区コード完全一致 & DISTRICT_MISMATCH)
// -----------------------------------------------------------------------------
runTest("Scenario 7: Integrity Guard (SYSTEM_INFO の地区コードが不一致の場合に即時遮断)", () => {
  assert.throws(() => {
    // MISMATCH_DISTRICT は registry にあるが、SYSTEM_INFO の B2 は "CORRUPTED_CODE"
    SpreadsheetResolver.getInstance().getSpreadsheet("MISMATCH_DISTRICT");
  }, /DISTRICT_MISMATCH/);
});

// -----------------------------------------------------------------------------
// TEST 8: Singleton 状態保持の完全排除検証 (リクエスト間での独立性)
// -----------------------------------------------------------------------------
runTest("Scenario 8: Singleton状態保持の排除 (KUWANAとOKAYAMAを交互に呼び出しても汚染されない)", () => {
  const resolver = SpreadsheetResolver.getInstance();

  // 1回目: KUWANA
  const ssKuwana = resolver.getSpreadsheet("KUWANA");
  assert.equal(ssKuwana.getId(), "ss-kuwana-id");
  assert.equal(ssKuwana.getName(), "POSTING_MAP_KUWANA");

  // 2回目: OKAYAMA
  const ssOkayama = resolver.getSpreadsheet("OKAYAMA");
  assert.equal(ssOkayama.getId(), "ss-okayama-id");
  assert.equal(ssOkayama.getName(), "POSTING_MAP_OKAYAMA");

  // 3回目: 再び KUWANA (状態が OKAYAMA に上書きされていないこと)
  const ssKuwana2 = resolver.getSpreadsheet("KUWANA");
  assert.equal(ssKuwana2.getId(), "ss-kuwana-id");
  assert.equal(ssKuwana2.getName(), "POSTING_MAP_KUWANA");
});

// -----------------------------------------------------------------------------
// TEST 9: ランキング集計の地区別分離
// -----------------------------------------------------------------------------
runTest("Scenario 9: 配布ランキングの地区別分離", () => {
  const reqKuwana = {
    postData: {
      contents: JSON.stringify({
        action: "getRanking",
        liffToken: "token_kuwana_user1",
        districtId: "KUWANA"
      })
    }
  };
  const resKuwana = doPost(reqKuwana);
  const dataKuwana = JSON.parse(resKuwana.text);
  assert.equal(dataKuwana.success, true);
  assert.equal(dataKuwana.ranking.length, 1);
  assert.equal(dataKuwana.ranking[0].staffId, "K001");
  assert.equal(dataKuwana.ranking[0].count, 100);

  const reqOkayama = {
    postData: {
      contents: JSON.stringify({
        action: "getRanking",
        liffToken: "token_okayama_user1",
        districtId: "OKAYAMA"
      })
    }
  };
  const resOkayama = doPost(reqOkayama);
  const dataOkayama = JSON.parse(resOkayama.text);
  assert.equal(dataOkayama.success, true);
  assert.equal(dataOkayama.ranking.length, 1);
  assert.equal(dataOkayama.ranking[0].staffId, "O001");
  assert.equal(dataOkayama.ranking[0].count, 250);
});

// -----------------------------------------------------------------------------
// TEST 10: Generation 2 オブジェクト形式 Registry の解決
// -----------------------------------------------------------------------------
runTest("Scenario 10: Generation 2 オブジェクト形式 Registry の動的解決", () => {
  const currentReg = JSON.parse(PropertiesService.getScriptProperties().getProperty("DISTRICT_REGISTRY"));
  currentReg["GEN2_DISTRICT"] = {
    spreadsheetId: "ss-kuwana-id",
    name: "GEN2_DISTRICT",
    enabled: true
  };
  PropertiesService.getScriptProperties().setProperty("DISTRICT_REGISTRY", JSON.stringify(currentReg));
  SpreadsheetResolver.getInstance().clearCache();

  const resolvedId = SpreadsheetResolver.getInstance().getSpreadsheetId("GEN2_DISTRICT");
  assert.equal(resolvedId, "ss-kuwana-id");
});

// -----------------------------------------------------------------------------
// TEST 11: enabled: false 地区のアクセス遮断
// -----------------------------------------------------------------------------
runTest("Scenario 11: enabled: false 地区のアクセス遮断", () => {
  const currentReg = JSON.parse(PropertiesService.getScriptProperties().getProperty("DISTRICT_REGISTRY"));
  currentReg["DISABLED_DISTRICT"] = {
    spreadsheetId: "ss-kuwana-id",
    name: "DISABLED_DISTRICT",
    enabled: false
  };
  PropertiesService.getScriptProperties().setProperty("DISTRICT_REGISTRY", JSON.stringify(currentReg));
  SpreadsheetResolver.getInstance().clearCache();

  assert.throws(() => {
    SpreadsheetResolver.getInstance().getSpreadsheetId("DISABLED_DISTRICT");
  }, /not found in DISTRICT_REGISTRY/);
});

// -----------------------------------------------------------------------------
// TEST 12: bootstrapEnvironment による新地区追加時の既存地区保護
// -----------------------------------------------------------------------------
runTest("Scenario 12: bootstrapEnvironment による既存地区の保護と新地区追加", () => {
  const initialReg = {
    "EXISTING_A": { spreadsheetId: "ss-a-id", enabled: true }
  };
  mockScriptProperties["DISTRICT_REGISTRY"] = JSON.stringify(initialReg);
  mockScriptProperties["TARGET_SPREADSHEET_ID"] = "legacy-ss-id";
  const validToken = "super-secret-provisioning-token-123456";
  mockScriptProperties["PROVISIONING_TOKEN_HASH"] = crypto.createHash('sha256').update(validToken).digest('hex');
  SpreadsheetResolver.getInstance().clearCache();

  // 新規地区スプレッドシートのモック（名前は districtId と完全一致）
  const ssNewB = new MockSpreadsheet("ss-b-id", "NEW_DISTRICT_B");
  mockSpreadsheets["ss-b-id"] = ssNewB;

  const req = {
    postData: {
      contents: JSON.stringify({
        action: "bootstrapEnvironment",
        districtId: "NEW_DISTRICT_B",
        targetSpreadsheetId: "ss-b-id",
        storageParentId: "folder-b-id",
        provisioningToken: validToken
      })
    }
  };

  const res = doPost(req);
  const data = JSON.parse(res.text);
  assert.equal(data.success, true);
  assert.equal(data.districtRegistryUpdated, true);

  const updatedReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  assert.ok(updatedReg["EXISTING_A"], "EXISTING_A must be preserved");
  assert.equal(updatedReg["EXISTING_A"].spreadsheetId, "ss-a-id");
  assert.ok(updatedReg["NEW_DISTRICT_B"], "NEW_DISTRICT_B must be added");
  assert.equal(updatedReg["NEW_DISTRICT_B"].spreadsheetId, "ss-b-id");
  assert.equal(updatedReg["NEW_DISTRICT_B"].enabled, true);

  // TARGET_SPREADSHEET_ID が上書きされていないこと（既存値保護）
  assert.equal(mockScriptProperties["TARGET_SPREADSHEET_ID"], "legacy-ss-id");

  // 後続シナリオ（Scenario 13〜15）のために DISTRICT_REGISTRY に KUWANA, OKAYAMA, NEW_DISTRICT_B を復元設定
  const fullReg = {
    "KUWANA": "ss-kuwana-id",
    "OKAYAMA": "ss-okayama-id",
    "NEW_DISTRICT_B": { spreadsheetId: "ss-b-id", enabled: true }
  };
  mockScriptProperties["DISTRICT_REGISTRY"] = JSON.stringify(fullReg);
  SpreadsheetResolver.getInstance().clearCache();
});

// -----------------------------------------------------------------------------
// TEST 13: SpreadsheetResolver: 重複 openById 排除検証 (同一実行内キャッシュ & clearCache)
// -----------------------------------------------------------------------------
runTest("Scenario 13: SpreadsheetResolver による重複 openById 呼出の排除とキャッシュ完全性", () => {
  const resolver = SpreadsheetResolver.getInstance();
  resolver.clearCache();

  openByIdCallCount = 0;
  const ss1 = resolver.getSpreadsheet("KUWANA");
  const ss2 = resolver.getSpreadsheet("KUWANA");
  const ss3 = resolver.getSpreadsheet("KUWANA");

  assert.equal(openByIdCallCount, 1, `openById should be called exactly once for KUWANA, but got ${openByIdCallCount}`);
  assert.equal(ss1, ss2, "ss1 and ss2 must be the exact same reference");
  assert.equal(ss2, ss3, "ss2 and ss3 must be the exact same reference");
  assert.ok(resolver.spreadsheetCacheByDistrict["KUWANA"], "KUWANA cache key must exist in resolver");

  // 直接取得したモックインスタンスとの等価性
  assert.equal(ss1.getId(), kuwanaSS.getId(), "Resolved spreadsheet ID must match kuwanaSS ID");
  assert.equal(ss1.getName(), kuwanaSS.getName(), "Resolved spreadsheet Name must match kuwanaSS Name");

  // clearCache でキャッシュが破棄され、次回再取得時に openById が再度1回だけ呼ばれること
  resolver.clearCache();
  assert.equal(Object.keys(resolver.spreadsheetCacheByDistrict).length, 0, "Resolver cache must be empty after clearCache");
  const ss4 = resolver.getSpreadsheet("KUWANA");
  assert.equal(openByIdCallCount, 2, "openById must be invoked once more after clearCache");
  assert.equal(ss4.getId(), kuwanaSS.getId());
});

// -----------------------------------------------------------------------------
// TEST 14: Contract Cache: ScriptCache MISS ➔ HIT ➔ Invalidation & Direct-Read 等価性 & Fail-Closed
// -----------------------------------------------------------------------------
runTest("Scenario 14: Contract Cache (MISS ➔ HIT ➔ Invalidation サイクル、Direct-Read等価性、Fail-Closed)", () => {
  const sysInfoService = SystemInfoService.getInstance();
  const testNow = new Date("2026-10-01T00:00:00Z");

  // NEW_DISTRICT_B (Scenario 12 で作成済) に SYSTEM_INFO をセットアップ
  const ssNewB = mockSpreadsheets["ss-b-id"];
  let newBSysInfo = ssNewB.getSheetByName("SYSTEM_INFO");
  if (!newBSysInfo) newBSysInfo = ssNewB.addSheet("SYSTEM_INFO");
  newBSysInfo.rows = [
    ["項目", "設定値"],
    ["地区コード", "NEW_DISTRICT_B"],
    ["地区名", "新地区B"],
    ["契約終了日", "2026-10-31"]
  ];

  // 1. 初期状態: キャッシュ空 (MISS)
  mockCache.store.clear();
  const status1 = sysInfoService.getContractStatus(null, testNow, "NEW_DISTRICT_B");
  assert.equal(status1.status, 'ACTIVE');
  assert.equal(status1.fromCache, undefined, "First call must be Cache MISS");
  assert.equal(status1.endDate, '2026-10-31');
  assert.ok(mockCache.get("CONTRACT_STATUS_NEW_DISTRICT_B"), "Cache must be populated after MISS");

  // 2. 2回目: Cache HIT
  const status2 = sysInfoService.getContractStatus(null, testNow, "NEW_DISTRICT_B");
  assert.equal(status2.status, 'ACTIVE');
  assert.equal(status2.fromCache, true, "Second call must be Cache HIT");
  assert.equal(status2.endDate, '2026-10-31');

  // 3. Direct-Read パスとの結果完全等価性検証 (fromCache 以外のプロパティが完全一致)
  const directStatus = sysInfoService.getContractStatus(newBSysInfo, testNow, "NEW_DISTRICT_B");
  assert.equal(status2.status, directStatus.status, "Cache path and direct-read status must match");
  assert.equal(status2.isExpired, directStatus.isExpired, "Cache path and direct-read isExpired must match");
  assert.equal(status2.endDate, directStatus.endDate, "Cache path and direct-read endDate must match");
  assert.equal(status2.code, directStatus.code, "Cache path and direct-read code must match");
  assert.equal(status2.today, directStatus.today, "Cache path and direct-read today must match");

  // 4. 契約終了日変更 ➔ Invalidation (ssNewB.getName() === "NEW_DISTRICT_B" のため完全無効化)
  sysInfoService.setContractEndDate("2026-11-15", "NEW_DISTRICT_B");
  assert.equal(mockCache.get("CONTRACT_STATUS_NEW_DISTRICT_B"), null, "Cache must be invalidated after setContractEndDate");

  // 5. 変更後の次回呼出: 最新値取得 & Cache 再構築
  const status3 = sysInfoService.getContractStatus(null, testNow, "NEW_DISTRICT_B");
  assert.equal(status3.status, 'ACTIVE');
  assert.equal(status3.fromCache, undefined, "First call after invalidation must be MISS");
  assert.equal(status3.endDate, '2026-11-15', "Must reflect updated end date");

  // 6. Fail-Closed: 取得不能・破損時の安全側遮断
  mockCache.store.clear();
  const corruptedSS = new MockSpreadsheet("ss-broken-contract-id", "BROKEN_CONTRACT");
  mockSpreadsheets["ss-broken-contract-id"] = corruptedSS;
  const currentReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  currentReg["BROKEN_CONTRACT"] = "ss-broken-contract-id";
  mockScriptProperties["DISTRICT_REGISTRY"] = JSON.stringify(currentReg);
  SpreadsheetResolver.getInstance().clearCache();

  const failClosedStatus = sysInfoService.getContractStatus(null, testNow, "BROKEN_CONTRACT");
  assert.equal(failClosedStatus.status, 'EXPIRED', "Must fail-closed to EXPIRED on error");
  assert.equal(failClosedStatus.isExpired, true, "isExpired must be true on fail-closed");
  assert.equal(failClosedStatus.code, 'CONTRACT_CHECK_FAILED', "Error code must indicate failure");
});

// -----------------------------------------------------------------------------
// TEST 15: getRoster / fetchRankingData 等価性検証 (cachedRoster 有無の完全等価)
// -----------------------------------------------------------------------------
runTest("Scenario 15: getRoster / fetchRankingData による cachedRoster 最適化と計算完全等価性", () => {
  const distRepo = DistributionRepository.getInstance();
  const staffService = StaffService.getInstance();

  // KUWANA 地区の名簿を取得
  const roster = staffService.getRoster("KUWANA");
  assert.ok(Array.isArray(roster), "getRoster must return an array");
  assert.equal(roster.length, 2, "KUWANA roster must have 2 staff members");
  assert.equal(roster[0].id, "K001");
  assert.equal(roster[1].id, "K002");

  // cachedRoster なし (直接参照パス)
  const rankingWithoutCache = distRepo.fetchRankingData("U_KUWANA_001", "KUWANA", null);

  // cachedRoster あり (STEP 2 最適化パス)
  const rankingWithCache = distRepo.fetchRankingData("U_KUWANA_001", "KUWANA", roster);

  // 厳格な結果等価性の検証
  assert.deepEqual(rankingWithCache, rankingWithoutCache, "Ranking results with/without cachedRoster must be strictly identical");
  assert.equal(rankingWithCache.length, 1);
  assert.equal(rankingWithCache[0].staffId, "K001");
  assert.equal(rankingWithCache[0].count, 100);
  assert.equal(rankingWithCache[0].isMe, true);
});

// =============================================================================
// PRODUCTION REGRESSION SUITE: LINE User ID Identity & staffId Lifecycle
// =============================================================================

// テスト用独立地区セットアップ
const identityTestSS = new MockSpreadsheet("ss-id-test-id", "POSTING_MAP_IDENTITY_TEST");
const idTestSysInfo = identityTestSS.addSheet("SYSTEM_INFO");
idTestSysInfo.rows = [
  ["項目", "設定値"],
  ["地区コード", "IDENTITY_TEST"],
  ["地区名", "認証テスト地区"],
  ["管理パスワード", "pwd_id_test"],
  ["契約終了日", "2026-10-31"]
];
const idTestStaff = identityTestSS.addSheet("名簿2026-09");
idTestStaff.rows = [
  ["STAFF_ID", "氏名", "LINE_USER_ID", "登録日時"]
];
mockSpreadsheets["ss-id-test-id"] = identityTestSS;

const regBeforeTest = JSON.parse(PropertiesService.getScriptProperties().getProperty("DISTRICT_REGISTRY"));
regBeforeTest["IDENTITY_TEST"] = "ss-id-test-id";
PropertiesService.getScriptProperties().setProperty("DISTRICT_REGISTRY", JSON.stringify(regBeforeTest));
SpreadsheetResolver.getInstance().clearCache();

// -----------------------------------------------------------------------------
// TEST 16: 当月最初の LINE User ID ➔ S001 新規採番
// -----------------------------------------------------------------------------
runTest("Scenario 16: 当月最初の LINE User ID ➔ S001 新規採番 (Production経路)", () => {
  const initialRowCount = idTestStaff.rows.length;
  assert.equal(initialRowCount, 1, "Initial roster must contain only header row");

  const req = {
    postData: {
      contents: JSON.stringify({
        action: "registerStaff",
        liffToken: "token_custom_user_1",
        districtId: "IDENTITY_TEST",
        lastName: "テスト太郎",
        firstName: "(LINE)"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);

  assert.equal(data.success, true, "registerStaff must succeed");
  assert.equal(data.id, "S001", "First staff in month must be assigned S001");
  assert.equal(data.message, "new", "Must be marked as new registration");
  assert.equal(idTestStaff.rows.length, 2, "One row must be appended");

  const row = idTestStaff.rows[1];
  assert.equal(row[0], "S001");
  assert.equal(row[1], "テスト太郎");
  assert.equal(row[2], "U_CUSTOM_user_1");
  assert.ok(row[3], "registeredAt must be populated");
});

// -----------------------------------------------------------------------------
// TEST 17: 次の別 LINE User ID ➔ S002 採番
// -----------------------------------------------------------------------------
runTest("Scenario 17: 次の別 LINE User ID ➔ S002 採番 (Production経路)", () => {
  const req = {
    postData: {
      contents: JSON.stringify({
        action: "registerStaff",
        liffToken: "token_custom_user_2",
        districtId: "IDENTITY_TEST",
        lastName: "テスト花子",
        firstName: "(LINE)"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);

  assert.equal(data.success, true, "registerStaff must succeed");
  assert.equal(data.id, "S002", "Second staff must be assigned S002");
  assert.equal(data.message, "new", "Must be marked as new registration");
  assert.equal(idTestStaff.rows.length, 3, "Total rows must now be 3");

  const row = idTestStaff.rows[2];
  assert.equal(row[0], "S002");
  assert.equal(row[1], "テスト花子");
  assert.equal(row[2], "U_CUSTOM_user_2");
});

// -----------------------------------------------------------------------------
// TEST 18: S001本人がキャッシュ削除後に再ログイン ➔ 既存S001復元 & 新規行不作成
// -----------------------------------------------------------------------------
runTest("Scenario 18: S001本人がキャッシュ削除後に再ログイン ➔ LINE User ID照合で既存S001復元 & 新規行不作成", () => {
  const rowCountBefore = idTestStaff.rows.length;

  // H-App の端末キャッシュ空での初回起動シーケンス (getStaffIdentity)
  const req = {
    postData: {
      contents: JSON.stringify({
        action: "getStaffIdentity",
        liffToken: "token_custom_user_1",
        districtId: "IDENTITY_TEST"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);

  assert.equal(data.success, true, "getStaffIdentity must succeed");
  assert.equal(data.registered, true, "Staff must be recognized as registered");
  assert.equal(data.staffId, "S001", "Must restore original staffId S001");
  assert.equal(data.staffName, "テスト太郎", "Must restore original staffName");
  assert.equal(idTestStaff.rows.length, rowCountBefore, "Roster row count must NOT increase on re-login");
});

// -----------------------------------------------------------------------------
// TEST 19: 同一 LINE User ID の再 registerStaff ➔ 二重登録防止 & 既存S001復元
// -----------------------------------------------------------------------------
runTest("Scenario 19: 同一 LINE User ID の再 registerStaff ➔ 二重登録防止 & 既存S001復元", () => {
  const rowCountBefore = idTestStaff.rows.length;

  const req = {
    postData: {
      contents: JSON.stringify({
        action: "registerStaff",
        liffToken: "token_custom_user_1",
        districtId: "IDENTITY_TEST",
        lastName: "テスト太郎（再入力）",
        firstName: "(LINE)"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);

  assert.equal(data.success, true, "registerStaff must succeed");
  assert.equal(data.id, "S001", "Must return existing S001");
  assert.equal(data.message, "existing", "Must indicate existing staff");
  assert.equal(idTestStaff.rows.length, rowCountBefore, "No duplicate row must be added");
});

// -----------------------------------------------------------------------------
// TEST 20: districtId 指定地区以外の名簿を変更しない (全行Snapshot & deepEqual完全不変)
// -----------------------------------------------------------------------------
runTest("Scenario 20: districtId 指定地区以外の名簿を変更しない (全行Snapshot & deepEqual完全不変)", () => {
  // 実行前の全対象地区名簿の全行Snapshotを取得
  const kuwanaSnapshot = JSON.parse(JSON.stringify(kuwanaStaff.rows));
  const okayamaSnapshot = JSON.parse(JSON.stringify(okayamaStaff.rows));
  const idTestSnapshot = JSON.parse(JSON.stringify(idTestStaff.rows));

  // OKAYAMA 地区宛てに新スタッフを登録
  const req = {
    postData: {
      contents: JSON.stringify({
        action: "registerStaff",
        liffToken: "token_custom_okayama_user",
        districtId: "OKAYAMA",
        lastName: "岡山 新規",
        firstName: "(LINE)"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);

  assert.equal(data.success, true);
  assert.equal(data.message, "new");

  // OKAYAMA だけが +1
  assert.equal(okayamaStaff.rows.length, okayamaSnapshot.length + 1, "OKAYAMA roster must increment by 1");
  assert.equal(okayamaStaff.rows[okayamaStaff.rows.length - 1][2], "U_CUSTOM_okayama_user");

  // 他地区はセル値・行数を含め厳格に完全不変 (deepEqual)
  assert.deepEqual(kuwanaStaff.rows, kuwanaSnapshot, "KUWANA roster must remain strictly unmodified (deepEqual)");
  assert.deepEqual(idTestStaff.rows, idTestSnapshot, "IDENTITY_TEST roster must remain strictly unmodified (deepEqual)");
});

// -----------------------------------------------------------------------------
// TEST 21: districtId 欠落時は Fail-Closed ＆ 全地区名簿完全不変 (mutation 0)
// -----------------------------------------------------------------------------
runTest("Scenario 21: districtId 欠落時は Fail-Closed ＆ 全地区名簿完全不変 (mutation 0)", () => {
  // 実行前の全対象地区名簿の全行Snapshotを取得
  const kuwanaSnapshot = JSON.parse(JSON.stringify(kuwanaStaff.rows));
  const okayamaSnapshot = JSON.parse(JSON.stringify(okayamaStaff.rows));
  const idTestSnapshot = JSON.parse(JSON.stringify(idTestStaff.rows));

  const req = {
    postData: {
      contents: JSON.stringify({
        action: "registerStaff",
        liffToken: "token_custom_no_district",
        lastName: "欠落 太郎",
        firstName: "(LINE)"
      })
    }
  };
  const res = doPost(req);
  const data = JSON.parse(res.text);

  // MISSING_DISTRICT_ID の検証
  assert.equal(data.success, false, "Missing districtId must fail");
  assert.equal(data.code, "MISSING_DISTRICT_ID", "Must return MISSING_DISTRICT_ID code");

  // 全地区名簿が完全不変（mutation 0）であることを deepEqual で確認
  assert.deepEqual(kuwanaStaff.rows, kuwanaSnapshot, "KUWANA roster must have ZERO mutations on missing districtId");
  assert.deepEqual(okayamaStaff.rows, okayamaSnapshot, "OKAYAMA roster must have ZERO mutations on missing districtId");
  assert.deepEqual(idTestStaff.rows, idTestSnapshot, "IDENTITY_TEST roster must have ZERO mutations on missing districtId");
});

// -----------------------------------------------------------------------------
// TEST 22: 翌月は前月 staffId を引き継がず S001 から新規採番 (Productionコード実経路 & 9月不変検証)
// -----------------------------------------------------------------------------
runTest("Scenario 22: 翌月は前月 staffId を引き継がず S001 から新規採番 (Productionコード実経路 & 9月不変検証)", () => {
  // 1. 翌月 2026-10 の空名簿シートを IDENTITY_TEST に用意
  const octStaff = identityTestSS.addSheet("名簿2026-10");
  octStaff.rows = [
    ["STAFF_ID", "氏名", "LINE_USER_ID", "登録日時"]
  ];

  // 9月名簿のSnapshotを取得（実行前の完全状態）
  const septStaff = identityTestSS.getSheetByName("名簿2026-09");
  const septSnapshot = JSON.parse(JSON.stringify(septStaff.rows));

  // 2. 時刻モックを 2026-10 に設定
  const originalDate = global.Date;
  const mockOctDate = new originalDate("2026-10-05T10:00:00+09:00");
  class MockDate202610 extends originalDate {
    constructor(...args) {
      if (args.length === 0) {
        super(mockOctDate.getTime());
      } else {
        super(...args);
      }
    }
    static now() {
      return mockOctDate.getTime();
    }
  }

  global.Date = MockDate202610;

  try {
    // 3. 9月に S001 だった同じ LINE User ID (token_custom_user_1 / U_CUSTOM_user_1) を 10月に登録
    // doPost ➔ processPostAction ➔ StaffService ➔ StaffRepository ➔ MonthlySheetResolver の Production 経路を通過
    const req = {
      postData: {
        contents: JSON.stringify({
          action: "registerStaff",
          liffToken: "token_custom_user_1",
          districtId: "IDENTITY_TEST",
          lastName: "テスト太郎（10月新任）",
          firstName: "(LINE)"
        })
      }
    };
    const res = doPost(req);
    const data = JSON.parse(res.text);

    // 4. 検証: 10月 = S001, message = new, 10月名簿に1行追加, 9月名簿は完全不変
    assert.equal(data.success, true, "registerStaff in October must succeed");
    assert.equal(data.id, "S001", "10月名簿では前月staffIdを引き継がずS001から新規採番されること");
    assert.equal(data.message, "new", "Must be marked as new registration for October");

    // 10月名簿に 1行追加されていること (ヘッダー1行 + データ1行 = 2行)
    assert.equal(octStaff.rows.length, 2, "October roster must have exactly 1 new row appended");
    assert.equal(octStaff.rows[1][0], "S001");
    assert.equal(octStaff.rows[1][1], "テスト太郎（10月新任）");
    assert.equal(octStaff.rows[1][2], "U_CUSTOM_user_1");

    // 9月名簿は完全不変であること
    assert.deepEqual(septStaff.rows, septSnapshot, "September roster must remain strictly unmodified (deepEqual)");
  } finally {
    // 5. テスト終了後は時刻モック等を必ず復元
    global.Date = originalDate;
  }
});

console.log('\n================================================================');
console.log(`TEST SUMMARY: Total=${passCount + failCount}, PASS=${passCount}, FAIL=${failCount}`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
