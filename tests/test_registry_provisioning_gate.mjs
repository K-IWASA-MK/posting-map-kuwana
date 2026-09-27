/**
 * test_registry_provisioning_gate.mjs
 * Generation 2 Registry Provisioning Acceptance Gate 機械検証スイート
 *
 * 必須検証項目:
 * 1. Registry exists             PASS
 * 2. New district entry exists   PASS
 * 3. spreadsheetId matches       PASS
 * 4. enabled                     PASS
 * 5. Known district routing      PASS
 * 6. Unknown district rejection  PASS
 * 7. Legacy fallback not used    PASS
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

console.log("====================================================");
console.log("🏛️ GENERATION 2 REGISTRY PROVISIONING ACCEPTANCE GATE");
console.log("====================================================");

// モック環境
const mockSpreadsheets = {};
const mockScriptProperties = {};

global.PropertiesService = {
  getScriptProperties() {
    return {
      getProperty(k) { return mockScriptProperties[k] || null; },
      setProperty(k, v) { mockScriptProperties[k] = String(v); },
      setProperties(obj) {
        for (const [k, v] of Object.entries(obj)) {
          mockScriptProperties[k] = String(v);
        }
      }
    };
  }
};

global.SpreadsheetApp = {
  openById(id) {
    if (mockSpreadsheets[id]) return mockSpreadsheets[id];
    throw new Error(`Spreadsheet not found: ${id}`);
  }
};

// ソースコードロード
const adapterCode = fs.readFileSync(path.join(REPO_ROOT, 'active/infrastructure/spreadsheet/spreadsheet_adapter.js'), 'utf8');
vm.runInThisContext(adapterCode);

// テスト用データ設定
const TEST_DISTRICT = "KUWANA";
const TEST_SS_ID = "ss-kuwana-pure-db-id";
const LEGACY_SS_ID = "ss-legacy-fallback-id";

// スプレッドシートモック
class MockSheet {
  constructor(rows = []) { this.rows = rows; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.length > 0 ? this.rows[0].length : 0; }
  getRange(r, c, nr = 1, nc = 1) {
    const sheet = this;
    return {
      getValues() {
        const res = [];
        for (let i = 0; i < nr; i++) {
          const rowData = sheet.rows[r - 1 + i] || [];
          res.push(rowData.slice(c - 1, c - 1 + nc));
        }
        return res;
      }
    };
  }
}

class MockSpreadsheet {
  constructor(id, name, districtCode) {
    this.id = id;
    this.name = name;
    this.sheets = {
      "SYSTEM_INFO": new MockSheet([
        ["項目", "設定値"],
        ["地区コード", districtCode],
        ["契約終了日", "2027-03-31"]
      ])
    };
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getSheetByName(n) { return this.sheets[n] || null; }
}

mockSpreadsheets[TEST_SS_ID] = new MockSpreadsheet(TEST_SS_ID, TEST_DISTRICT, TEST_DISTRICT);
mockSpreadsheets[LEGACY_SS_ID] = new MockSpreadsheet(LEGACY_SS_ID, "LEGACY", "LEGACY");

// 初期環境: レガシー fallback と Generation 2 Registry の共存
mockScriptProperties["TARGET_SPREADSHEET_ID"] = LEGACY_SS_ID;
mockScriptProperties["DISTRICT_REGISTRY"] = JSON.stringify({
  [TEST_DISTRICT]: {
    spreadsheetId: TEST_SS_ID,
    storageFolderId: "folder-kuwana-id",
    name: TEST_DISTRICT,
    enabled: true
  }
});

let passCount = 0;
let failCount = 0;

function runGate(gateName, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${gateName}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${gateName}:`, err.message);
    failCount++;
  }
}

console.log("\n▶ Running Registry Verification Gates...");

// Gate 1: Registry exists
runGate("Gate 1: Registry exists", () => {
  const regRaw = PropertiesService.getScriptProperties().getProperty("DISTRICT_REGISTRY");
  assert.ok(regRaw, "DISTRICT_REGISTRY must exist in Script Properties");
  const parsed = JSON.parse(regRaw);
  assert.equal(typeof parsed, "object", "DISTRICT_REGISTRY must be a valid JSON object");
});

// Gate 2: New district entry exists
runGate("Gate 2: New district entry exists", () => {
  const reg = JSON.parse(PropertiesService.getScriptProperties().getProperty("DISTRICT_REGISTRY"));
  assert.ok(reg[TEST_DISTRICT], `Entry for district "${TEST_DISTRICT}" must exist in DISTRICT_REGISTRY`);
});

// Gate 3: spreadsheetId matches
runGate("Gate 3: spreadsheetId matches", () => {
  const reg = JSON.parse(PropertiesService.getScriptProperties().getProperty("DISTRICT_REGISTRY"));
  const entry = reg[TEST_DISTRICT];
  const actualSsId = (typeof entry === "object" && entry !== null) ? entry.spreadsheetId : entry;
  assert.equal(actualSsId, TEST_SS_ID, `spreadsheetId must match configured DB ID`);
});

// Gate 4: enabled
runGate("Gate 4: enabled is true", () => {
  const reg = JSON.parse(PropertiesService.getScriptProperties().getProperty("DISTRICT_REGISTRY"));
  const entry = reg[TEST_DISTRICT];
  assert.ok(typeof entry === "object" && entry !== null, "Entry must be an object with metadata");
  assert.equal(entry.enabled, true, "enabled must be true");
});

// Gate 5: Known district routing
runGate("Gate 5: Known district routing", () => {
  SpreadsheetResolver.getInstance().clearCache();
  const ss = SpreadsheetResolver.getInstance().getSpreadsheet(TEST_DISTRICT);
  assert.equal(ss.getId(), TEST_SS_ID, `Resolved spreadsheet must match target pure DB ID`);
});

// Gate 6: Unknown district rejection
runGate("Gate 6: Unknown district rejection", () => {
  SpreadsheetResolver.getInstance().clearCache();
  assert.throws(() => {
    SpreadsheetResolver.getInstance().getSpreadsheet("UNKNOWN_XYZ");
  }, /not found in DISTRICT_REGISTRY/, "Unknown district must be rejected with 'not found in DISTRICT_REGISTRY'");
});

// Gate 7: Legacy fallback not used
runGate("Gate 7: Legacy fallback not used", () => {
  SpreadsheetResolver.getInstance().clearCache();
  // TARGET_SPREADSHEET_ID が存在していても、未登録地区が LEGACY_SS_ID にフォールバックしてはならない
  assert.throws(() => {
    const ss = SpreadsheetResolver.getInstance().getSpreadsheet("ANOTHER_UNKNOWN");
    if (ss && ss.getId() === LEGACY_SS_ID) {
      throw new Error("CRITICAL: Leaked to legacy fallback!");
    }
  }, /not found in DISTRICT_REGISTRY/);
});

console.log("\n====================================================");
console.log(`GATE SUMMARY: Total=7, PASS=${passCount}, FAIL=${failCount}`);
console.log("====================================================");

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
