/**
 * Infrastructure Layer - Drive Adapter Module
 * 
 * Section: SEC-004 Drive Utilities
 * Owner Layer: Infrastructure Layer
 * Responsibility: DriveApp へのアクセス、ストレージフォルダ ID 取得、書き込み認証テストのカプセル化
 */

function getStorageFolderId(districtId = "") {
  const cleanDistrictId = String(districtId || "").trim().toUpperCase();
  const props = PropertiesService.getScriptProperties();
  const registryRaw = props.getProperty("DISTRICT_REGISTRY");

  // 1. null のみ Legacy 未設定
  if (registryRaw === null) {
    const id = props.getProperty("STORAGE_PARENT_ID");
    return id || (typeof CONFIG !== 'undefined' ? CONFIG.STORAGE_PARENT_ID : null);
  }

  // 2. 空文字・空白文字列は configured-corrupt (Fail-Closed)
  if (typeof registryRaw === "string" && registryRaw.trim() === "") {
    throw new Error("[DriveAdapter] DISTRICT_REGISTRY is configured but empty (corrupted).");
  }

  // 3. JSON パース & 破損チェック
  let registry = {};
  try {
    registry = JSON.parse(registryRaw);
  } catch (errP) {
    console.error("[DriveAdapter] Failed to parse DISTRICT_REGISTRY JSON:", errP);
    throw new Error("[DriveAdapter] DISTRICT_REGISTRY is corrupted.");
  }

  // 4. DISTRICT_REGISTRY 設定時は districtId 必須 (global fallback 絶対禁止)
  if (!cleanDistrictId) {
    throw new Error("[DriveAdapter] districtId is required for multi-district drive resolution. No fallback allowed.");
  }

  const normalizedKey = Object.keys(registry).find(k => k.trim().toUpperCase() === cleanDistrictId);
  if (!normalizedKey || !registry[normalizedKey]) {
    throw new Error(`[DriveAdapter] District "${cleanDistrictId}" not found in DISTRICT_REGISTRY.`);
  }

  const entry = registry[normalizedKey];
  if (typeof entry === "object" && entry !== null) {
    if (entry.enabled === false) {
      throw new Error(`[DriveAdapter] District "${cleanDistrictId}" is disabled in DISTRICT_REGISTRY.`);
    }
    const folderId = entry.storageFolderId || entry.storageParentId;
    if (!folderId) {
      throw new Error(`[DriveAdapter] storageFolderId is missing for district "${cleanDistrictId}" in DISTRICT_REGISTRY.`);
    }
    return String(folderId).trim();
  } else {
    throw new Error(`[DriveAdapter] Invalid entry format for district "${cleanDistrictId}". storageFolderId is required.`);
  }
}

function authorizeAndTestDriveWrite() {
  try {
    const folderId = getStorageFolderId();
    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob("DRIVE_AUTH_TEST", "text/plain", "_auth_test.txt");
    const file = folder.createFile(blob);
    file.setTrashed(true);
    Logger.log("✅ Drive write: SUCCESS. Folder: " + folder.getName());
  } catch (e) {
    Logger.log("❌ Drive write FAILED: " + e.toString());
  }
}
