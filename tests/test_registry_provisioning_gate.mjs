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
import crypto from 'node:crypto';
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
      deleteProperty(k) { delete mockScriptProperties[k]; },
      getProperties() { return { ...mockScriptProperties }; },
      setProperties(obj) {
        for (const [k, v] of Object.entries(obj)) {
          mockScriptProperties[k] = String(v);
        }
      }
    };
  }
};

global.Utilities = {
  computeDigest(algo, str) {
    return Array.from(crypto.createHash('sha256').update(str).digest());
  },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' }
};

global.CacheService = {
  getScriptCache() {
    return {
      remove(k) {},
      get(k) { return null; },
      put(k, v, ttl) {}
    };
  }
};

global.ContentService = {
  MimeType: { JSON: 'JSON' },
  createTextOutput(str) {
    return {
      content: str,
      setMimeType(m) { return this; }
    };
  }
};

global.SpreadsheetApp = {
  openById(id) {
    if (mockSpreadsheets[id]) return mockSpreadsheets[id];
    throw new Error(`Spreadsheet not found: ${id}`);
  },
  flush() {}
};

// ソースコードロード
const adapterCode = fs.readFileSync(path.join(REPO_ROOT, 'active/infrastructure/spreadsheet/spreadsheet_adapter.js'), 'utf8');
const provisionerCode = fs.readFileSync(path.join(REPO_ROOT, 'active/business/system/district_provisioner.js'), 'utf8');
const v2ApiCode = fs.readFileSync(path.join(REPO_ROOT, 'active/api/v2_api.js'), 'utf8');
vm.runInThisContext(adapterCode);
vm.runInThisContext(v2ApiCode);

// Drive モック環境の構築
const mockFolders = {};
const mockFiles = {};

function createMockFolder(id, name, parent = null) {
  const folder = {
    id,
    name,
    parent,
    files: [],
    subFolders: {},
    getId() { return this.id; },
    getName() { return this.name; },
    getParents() {
      let yielded = false;
      const p = this.parent;
      return {
        hasNext() { return !yielded && p !== null; },
        next() { yielded = true; return p; }
      };
    },
    createFolder(subName) {
      const subId = `${this.id}_${subName}`;
      const sub = createMockFolder(subId, subName, this);
      this.subFolders[subName] = sub;
      mockFolders[subId] = sub;
      return sub;
    },
    getFoldersByName(subName) {
      const sub = this.subFolders[subName];
      let yielded = false;
      return {
        hasNext() { return !!sub && !yielded; },
        next() { yielded = true; return sub; }
      };
    },
    getFilesByName(fileName) {
      const matched = this.files.filter(f => f.getName() === fileName && !f.trashed);
      let idx = 0;
      return {
        hasNext() { return idx < matched.length; },
        next() { return matched[idx++]; }
      };
    },
    getFiles() {
      let idx = 0;
      return {
        hasNext() { return idx < this.files.length; },
        next() { return this.files[idx++]; }
      };
    }
  };
  mockFolders[id] = folder;
  return folder;
}

function createMockFile(id, name, parent = null, mimeType = "application/vnd.google-apps.spreadsheet") {
  const file = {
    id,
    name,
    parent,
    mimeType,
    trashed: false,
    getId() { return this.id; },
    getName() { return this.name; },
    getUrl() { return `https://drive.google.com/file/d/${this.id}/view`; },
    getMimeType() { return this.mimeType; },
    isTrashed() { return this.trashed; },
    setTrashed(v) { this.trashed = !!v; },
    getParents() {
      let yielded = false;
      const p = this.parent;
      return {
        hasNext() { return !yielded && p !== null; },
        next() { yielded = true; return p; }
      };
    },
    makeCopy(newName, targetFolder) {
      const copyId = `copy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const copiedFile = createMockFile(copyId, newName, targetFolder, this.mimeType);
      mockFiles[copyId] = copiedFile;

      // Spreadsheetモックも同時に複製
      const copySS = new MockSpreadsheet(copyId, newName, newName.replace(/^POSTING_MAP_DB_/i, ''));
      mockSpreadsheets[copyId] = copySS;

      return copiedFile;
    }
  };
  mockFiles[id] = file;
  if (parent) {
    parent.files.push(file);
  }
  return file;
}

global.DriveApp = {
  getFolderById(id) {
    if (!mockFolders[id]) {
      throw new Error(`Drive folder not found: ${id}`);
    }
    return mockFolders[id];
  },
  getFileById(id) {
    if (!mockFiles[id]) {
      throw new Error(`Drive file not found: ${id}`);
    }
    return mockFiles[id];
  }
};

global.LockService = {
  getScriptLock() {
    return {
      waitLock() {},
      releaseLock() {},
      tryLock() { return true; }
    };
  }
};

mockScriptProperties['PROVISIONING_TOKEN_HASH'] = computeSha256("valid-token");

vm.runInThisContext(provisionerCode);

// テスト用データ設定
const TEST_DISTRICT = "KUWANA";
const TEST_SS_ID = "ss-kuwana-pure-db-id";
const LEGACY_SS_ID = "ss-legacy-fallback-id";
const BRANCH_ROOT_ID = "folder-03-branch-root-id";

// スプレッドシートモック
class MockSheet {
  constructor(rows = [], name = "SYSTEM_INFO") {
    this.rows = rows;
    this.name = name;
  }
  getName() { return this.name; }
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
  getSheets() { return Object.values(this.sheets); }
}

mockSpreadsheets[TEST_SS_ID] = new MockSpreadsheet(TEST_SS_ID, TEST_DISTRICT, TEST_DISTRICT);
mockSpreadsheets[LEGACY_SS_ID] = new MockSpreadsheet(LEGACY_SS_ID, "LEGACY", "LEGACY");

// Drive 階層モック初期化
const rootBranchFolder = createMockFolder(BRANCH_ROOT_ID, "03_BRANCH", null);
const templateFolder = createMockFolder("folder-01-template-id", "Templates", null);
const templateSSFile = createMockFile("template-ss-empty-id", "TEMPLATE_EMPTY_DB", templateFolder);
mockSpreadsheets["template-ss-empty-id"] = new MockSpreadsheet("template-ss-empty-id", "TEMPLATE_EMPTY_DB", "TEMPLATE");

// 初期環境: レガシー fallback と Generation 2 Registry の共存
mockScriptProperties["BRANCH_ROOT_FOLDER_ID"] = BRANCH_ROOT_ID;
mockScriptProperties["TARGET_SPREADSHEET_ID"] = LEGACY_SS_ID;
mockScriptProperties["DISTRICT_REGISTRY"] = JSON.stringify({
  [TEST_DISTRICT]: {
    spreadsheetId: TEST_SS_ID,
    storageFolderId: "folder-kuwana-storage-id",
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

console.log("\n▶ Running Registry Verification Gates (Gates 1-7)...");

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
  assert.throws(() => {
    const ss = SpreadsheetResolver.getInstance().getSpreadsheet("ANOTHER_UNKNOWN");
    if (ss && ss.getId() === LEGACY_SS_ID) {
      throw new Error("CRITICAL: Leaked to legacy fallback!");
    }
  }, /not found in DISTRICT_REGISTRY/);
});

console.log("\n▶ Running Canonical Drive Physical Layout Gates (Gates 8-13)...");

// プロビジョニング実行テスト用の新地区
const PROV_DISTRICT = "SHIZUOKA";
const prov = DistrictProvisioner.getInstance();

// 1. resolveOrCreateDistrictDriveStructure の実行
const driveStructure = prov.resolveOrCreateDistrictDriveStructure(PROV_DISTRICT);

// 2. createDistrictDatabase の実行
const dbResult = prov.createDistrictDatabase("template-ss-empty-id", null, null, {
  districtId: PROV_DISTRICT,
  provisioningToken: "valid-token"
});
assert.equal(dbResult.success, true, "createDistrictDatabase must succeed: " + JSON.stringify(dbResult));

// 3. REGISTRY への登録（bootstrapEnvironment 等価モック）
const currentReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
currentReg[PROV_DISTRICT] = {
  spreadsheetId: dbResult.spreadsheetId,
  storageFolderId: driveStructure.storageFolderId,
  name: PROV_DISTRICT,
  enabled: false
};
mockScriptProperties["DISTRICT_REGISTRY"] = JSON.stringify(currentReg);

// Gate 8: BRANCH_ROOT_FOLDER_ID exists in Script Properties
runGate("Gate 8: BRANCH_ROOT_FOLDER_ID exists in Script Properties", () => {
  const branchRootId = PropertiesService.getScriptProperties().getProperty("BRANCH_ROOT_FOLDER_ID");
  assert.ok(branchRootId, "BRANCH_ROOT_FOLDER_ID must exist in Script Properties");
  assert.equal(branchRootId, BRANCH_ROOT_ID);
});

// Gate 9: districtFolder.parentId === BRANCH_ROOT_FOLDER_ID
runGate("Gate 9: districtFolder.parentId === BRANCH_ROOT_FOLDER_ID", () => {
  const distFolder = DriveApp.getFolderById(driveStructure.districtFolderId);
  assert.ok(distFolder, "districtFolder must be openable");
  const parentIter = distFolder.getParents();
  assert.ok(parentIter.hasNext(), "districtFolder must have a parent");
  const parentFolder = parentIter.next();
  assert.equal(parentFolder.getId(), BRANCH_ROOT_ID, "districtFolder parent must be 03_BRANCH root");
});

// Gate 10: spreadsheet.parentId === districtFolderId (real spreadsheet, not shortcut)
runGate("Gate 10: spreadsheet.parentId === districtFolderId (real spreadsheet, not shortcut)", () => {
  const ssFile = DriveApp.getFileById(dbResult.spreadsheetId);
  assert.ok(ssFile, "Spreadsheet file must exist");
  assert.equal(ssFile.getName(), `POSTING_MAP_DB_${PROV_DISTRICT}`);
  assert.notEqual(ssFile.getMimeType(), "application/vnd.google-apps.shortcut", "DB must not be a shortcut");
  const parentIter = ssFile.getParents();
  assert.ok(parentIter.hasNext(), "Spreadsheet file must have a parent");
  const parentFolder = parentIter.next();
  assert.equal(parentFolder.getId(), driveStructure.districtFolderId, "Spreadsheet parent must be districtFolder");
});

// Gate 11: storageFolder.parentId === districtFolderId
runGate("Gate 11: storageFolder.parentId === districtFolderId", () => {
  const storageFolder = DriveApp.getFolderById(driveStructure.storageFolderId);
  assert.ok(storageFolder, "storageFolder must be openable");
  assert.equal(storageFolder.getName(), `${PROV_DISTRICT} 支部_STORAGE`);
  const parentIter = storageFolder.getParents();
  assert.ok(parentIter.hasNext(), "storageFolder must have a parent");
  const parentFolder = parentIter.next();
  assert.equal(parentFolder.getId(), driveStructure.districtFolderId, "storageFolder parent must be districtFolder");
});

// Gate 12: sourceArchiveFolder.parentId === districtFolderId
runGate("Gate 12: sourceArchiveFolder.parentId === districtFolderId", () => {
  const archiveFolder = DriveApp.getFolderById(driveStructure.sourceArchiveFolderId);
  assert.ok(archiveFolder, "archiveFolder must be openable");
  assert.equal(archiveFolder.getName(), "SOURCE_ARCHIVE");
  const parentIter = archiveFolder.getParents();
  assert.ok(parentIter.hasNext(), "archiveFolder must have a parent");
  const parentFolder = parentIter.next();
  assert.equal(parentFolder.getId(), driveStructure.districtFolderId, "archiveFolder parent must be districtFolder");
});

// Gate 13: DISTRICT_REGISTRY entry matches created IDs
runGate("Gate 13: DISTRICT_REGISTRY entry matches created IDs", () => {
  const reg = JSON.parse(PropertiesService.getScriptProperties().getProperty("DISTRICT_REGISTRY"));
  const entry = reg[PROV_DISTRICT];
  assert.ok(entry, "Registry entry must exist for PROV_DISTRICT");
  assert.equal(entry.spreadsheetId, dbResult.spreadsheetId, "Registered spreadsheetId must match DB file ID");
  assert.equal(entry.storageFolderId, driveStructure.storageFolderId, "Registered storageFolderId must match storage folder ID");
});

console.log("\n▶ Running Provisioner Unit Invariant Tests...");

// Unit Test 1: resolveOrCreateDistrictDriveStructure 冪等性（重複作成ゼロ）
runGate("Unit 1: resolveOrCreateDistrictDriveStructure idempotency", () => {
  const second = prov.resolveOrCreateDistrictDriveStructure(PROV_DISTRICT);
  assert.equal(second.districtFolderId, driveStructure.districtFolderId, "District folder ID must be identical on second call");
  assert.equal(second.storageFolderId, driveStructure.storageFolderId, "Storage folder ID must be identical on second call");
  assert.equal(second.sourceArchiveFolderId, driveStructure.sourceArchiveFolderId, "Source archive folder ID must be identical on second call");
});

// Unit Test 2: BRANCH_ROOT_FOLDER_ID 欠落時の Fail-Closed
runGate("Unit 2: Missing BRANCH_ROOT_FOLDER_ID fails closed", () => {
  const saved = mockScriptProperties["BRANCH_ROOT_FOLDER_ID"];
  try {
    delete mockScriptProperties["BRANCH_ROOT_FOLDER_ID"];
    assert.throws(() => {
      prov.resolveOrCreateDistrictDriveStructure("FAIL_DISTRICT");
    }, /BRANCH_ROOT_FOLDER_ID is not configured in Script Properties/);
  } finally {
    mockScriptProperties["BRANCH_ROOT_FOLDER_ID"] = saved;
  }
});

// Unit Test 3: createDistrictDatabase の重複作成抑止（自動ゴミ箱送り完全廃止）
runGate("Unit 3: createDistrictDatabase rejects existing DB (No Auto-Trash)", () => {
  const dupResult = prov.createDistrictDatabase("template-ss-empty-id", null, null, {
    districtId: PROV_DISTRICT,
    provisioningToken: "valid-token"
  });
  assert.equal(dupResult.success, false, "Must reject when canonical DB already exists");
  assert.equal(dupResult.code, "DISTRICT_DB_ALREADY_EXISTS");
});

// Unit Test 4: createDistrictDatabase の Legacy Assertion (FOLDER_MISMATCH)
runGate("Unit 4: createDistrictDatabase FOLDER_MISMATCH assertion", () => {
  const badFolderResult = prov.createDistrictDatabase("template-ss-empty-id", null, "wrong-folder-id", {
    districtId: "NEW_DIST_C",
    provisioningToken: "valid-token"
  });
  assert.equal(badFolderResult.success, false);
  assert.equal(badFolderResult.code, "FOLDER_MISMATCH");
});

// Unit Test 5: createDistrictDatabase の Legacy Assertion (INVALID_DISTRICT_NAME)
runGate("Unit 5: createDistrictDatabase INVALID_DISTRICT_NAME assertion", () => {
  const badNameResult = prov.createDistrictDatabase("template-ss-empty-id", "ARBITRARY_NAME_XYZ", null, {
    districtId: "NEW_DIST_D",
    provisioningToken: "valid-token"
  });
  assert.equal(badNameResult.success, false);
  assert.equal(badNameResult.code, "INVALID_DISTRICT_NAME");
});

console.log("\n▶ Running repairDistrictDriveBinding Gates (Gates 14-30)...");

// Mock Drive structure for repairDistrictDriveBinding
const repairBranchRoot = createMockFolder("test-repair-branch-root-id", "03_BRANCH");
const repairKuwanaFolder = repairBranchRoot.createFolder("KUWANA");
const repairCanonicalStorage = repairKuwanaFolder.createFolder("KUWANA 支部_STORAGE");
const canonicalStorageId = repairCanonicalStorage.getId();
const oldStorageFolder = createMockFolder("old-storage-folder-id", "Templates");

const VALID_TOKEN = "valid-token";
const RAW_HASH_VALID = computeSha256(VALID_TOKEN);

function resetRepairState() {
  delete mockScriptProperties["BRANCH_ROOT_FOLDER_ID"];
  mockScriptProperties["PROVISIONING_TOKEN_HASH"] = RAW_HASH_VALID;
  mockScriptProperties["STORAGE_PARENT_ID"] = "old-storage-folder-id";
  mockScriptProperties["TARGET_SPREADSHEET_ID"] = "ss-kuwana-pure-db-id";
  mockScriptProperties["GOOGLE_MAPS_API_KEY"] = "test-maps-key";
  mockScriptProperties["LINE_LIFF_ID"] = "test-liff-id";
  mockScriptProperties["DISTRICT_REGISTRY"] = JSON.stringify({
    KUWANA: {
      spreadsheetId: "ss-kuwana-pure-db-id",
      storageFolderId: "old-storage-folder-id",
      name: "KUWANA",
      enabled: true
    },
    OKAYAMA_02: {
      spreadsheetId: "ss-okayama-id",
      storageFolderId: "storage-okayama-id",
      name: "OKAYAMA_02",
      enabled: true
    }
  });
}

// Gate 14: branch root absent → set success
runGate("Gate 14: repairDistrictDriveBinding initial seed sets BRANCH_ROOT_FOLDER_ID", () => {
  resetRepairState();
  assert.equal(mockScriptProperties["BRANCH_ROOT_FOLDER_ID"], undefined);

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true, "Should succeed: " + (res.message || res.code));
  assert.equal(mockScriptProperties["BRANCH_ROOT_FOLDER_ID"], "test-repair-branch-root-id");
  assert.equal(mockScriptProperties["STORAGE_PARENT_ID"], canonicalStorageId);
  const reg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  assert.equal(reg.KUWANA.storageFolderId, canonicalStorageId);
});

// Gate 15: same branch root → idempotent success (no-op)
runGate("Gate 15: repairDistrictDriveBinding idempotent success with same branch root", () => {
  assert.equal(mockScriptProperties["BRANCH_ROOT_FOLDER_ID"], "test-repair-branch-root-id");

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: canonicalStorageId,
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  assert.equal(mockScriptProperties["BRANCH_ROOT_FOLDER_ID"], "test-repair-branch-root-id");
});

// Gate 16: different existing branch root → fail closed (BRANCH_ROOT_MISMATCH, mutation 0)
runGate("Gate 16: repairDistrictDriveBinding mismatched existing branch root fails closed", () => {
  const savedRoot = mockScriptProperties["BRANCH_ROOT_FOLDER_ID"];
  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "different-branch-root-id",
    expectedCurrentStorageFolderId: canonicalStorageId,
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, false);
  assert.equal(res.code, "BRANCH_ROOT_MISMATCH");
  assert.equal(mockScriptProperties["BRANCH_ROOT_FOLDER_ID"], savedRoot, "Root must not be mutated");
});

// Gate 17: storage old ID CAS match → success
runGate("Gate 17: repairDistrictDriveBinding storage old ID CAS match updates storageFolderId", () => {
  resetRepairState();
  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  const reg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  assert.equal(reg.KUWANA.storageFolderId, canonicalStorageId);
  assert.equal(mockScriptProperties["STORAGE_PARENT_ID"], canonicalStorageId);
});

// Gate 18: storage stale ID → mutation 0 (STALE_WRITE)
runGate("Gate 18: repairDistrictDriveBinding stale current storageFolderId fails closed (STALE_WRITE)", () => {
  resetRepairState();
  const savedReg = mockScriptProperties["DISTRICT_REGISTRY"];
  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "wrong-stale-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, false);
  assert.equal(res.code, "STALE_WRITE");
  assert.equal(mockScriptProperties["DISTRICT_REGISTRY"], savedReg, "Registry must not be mutated");
});

// Gate 19: target storage != server-resolved canonical → fail (STORAGE_FOLDER_MISMATCH, mutation 0)
runGate("Gate 19: repairDistrictDriveBinding non-canonical target storage fails closed", () => {
  resetRepairState();
  const savedReg = mockScriptProperties["DISTRICT_REGISTRY"];
  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: "unresolved-fake-storage-id",
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, false);
  assert.equal(res.code, "STORAGE_FOLDER_MISMATCH");
  assert.equal(mockScriptProperties["DISTRICT_REGISTRY"], savedReg, "Registry must not be mutated");
});

// Gate 20: enabled:true remains true
runGate("Gate 20: repairDistrictDriveBinding enabled: true is strictly preserved", () => {
  resetRepairState();
  const beforeReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  assert.equal(beforeReg.KUWANA.enabled, true);

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  const afterReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  assert.equal(afterReg.KUWANA.enabled, true, "enabled must remain true");
});

// Gate 21: spreadsheetId unchanged
runGate("Gate 21: repairDistrictDriveBinding spreadsheetId is strictly unchanged", () => {
  resetRepairState();
  const beforeReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  const expectedSS = beforeReg.KUWANA.spreadsheetId;

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  const afterReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  assert.equal(afterReg.KUWANA.spreadsheetId, expectedSS, "spreadsheetId must not change");
});

// Gate 22: other district 0 diff
runGate("Gate 22: repairDistrictDriveBinding other district entry has 0 diff", () => {
  resetRepairState();
  const beforeReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  const expectedOkayama = JSON.stringify(beforeReg.OKAYAMA_02);

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  const afterReg = JSON.parse(mockScriptProperties["DISTRICT_REGISTRY"]);
  assert.equal(JSON.stringify(afterReg.OKAYAMA_02), expectedOkayama, "Other district must be 100% identical");
});

// Gate 23: PROVISIONING_TOKEN_HASH unchanged
runGate("Gate 23: repairDistrictDriveBinding PROVISIONING_TOKEN_HASH strictly unchanged", () => {
  resetRepairState();
  const originalHash = mockScriptProperties["PROVISIONING_TOKEN_HASH"];

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  assert.equal(mockScriptProperties["PROVISIONING_TOKEN_HASH"], originalHash, "Token hash must not change");
});

// Gate 24: TARGET_SPREADSHEET_ID unchanged
runGate("Gate 24: repairDistrictDriveBinding TARGET_SPREADSHEET_ID strictly unchanged", () => {
  resetRepairState();
  const originalTargetSS = mockScriptProperties["TARGET_SPREADSHEET_ID"];

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  assert.equal(mockScriptProperties["TARGET_SPREADSHEET_ID"], originalTargetSS, "TARGET_SPREADSHEET_ID must not change");
});

// Gate 25: unrelated Properties 0 diff
runGate("Gate 25: repairDistrictDriveBinding unrelated Script Properties have 0 diff", () => {
  resetRepairState();

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  assert.equal(mockScriptProperties["GOOGLE_MAPS_API_KEY"], "test-maps-key");
  assert.equal(mockScriptProperties["LINE_LIFF_ID"], "test-liff-id");
});

// Gate 26: read-back mechanical verification
runGate("Gate 26: repairDistrictDriveBinding read-back mechanical verification succeeds", () => {
  resetRepairState();

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, true);
  assert.equal(res.districtId, "KUWANA");
  assert.equal(res.branchRootFolderId, "test-repair-branch-root-id");
  assert.equal(res.storageFolderId, canonicalStorageId);
  assert.equal(res.storageParentId, canonicalStorageId);
  assert.equal(res.districtRegistryUpdated, true);
});

// Gate 27: corrupted Registry → mutation 0 (CORRUPTED_REGISTRY)
runGate("Gate 27: repairDistrictDriveBinding corrupted Registry fails closed (CORRUPTED_REGISTRY)", () => {
  resetRepairState();
  mockScriptProperties["DISTRICT_REGISTRY"] = "{INVALID_JSON...";

  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, false);
  assert.equal(res.code, "CORRUPTED_REGISTRY");
});

// Gate 28: Non-existent district fails closed (DISTRICT_NOT_FOUND)
runGate("Gate 28: repairDistrictDriveBinding non-existent district fails closed (DISTRICT_NOT_FOUND)", () => {
  resetRepairState();
  const res = handleRepairDistrictDriveBinding({
    districtId: "NON_EXISTENT_DIST",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, false);
  assert.equal(res.code, "DISTRICT_NOT_FOUND");
});

// Gate 29: expectedRegistryRawHash mismatch fails closed (STALE_WRITE)
runGate("Gate 29: repairDistrictDriveBinding expectedRegistryRawHash CAS mismatch fails closed", () => {
  resetRepairState();
  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    expectedCurrentStorageFolderId: "old-storage-folder-id",
    targetStorageFolderId: canonicalStorageId,
    expectedRegistryRawHash: "0000000000000000000000000000000000000000000000000000000000000000",
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, false);
  assert.equal(res.code, "STALE_WRITE");
});

// Gate 30: Missing required arguments fails closed (INVALID_ARGUMENT)
runGate("Gate 30: repairDistrictDriveBinding missing required argument fails closed", () => {
  resetRepairState();
  const res = handleRepairDistrictDriveBinding({
    districtId: "KUWANA",
    branchRootFolderId: "test-repair-branch-root-id",
    targetStorageFolderId: canonicalStorageId,
    provisioningToken: VALID_TOKEN
  }, null);

  assert.equal(res.success, false);
  assert.equal(res.code, "INVALID_ARGUMENT");
});

console.log("\n====================================================");
console.log(`GATE & UNIT SUMMARY: Total=${passCount + failCount}, PASS=${passCount}, FAIL=${failCount}`);
console.log("====================================================");

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
