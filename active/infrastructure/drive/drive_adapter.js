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

  // 1. districtId あり + DISTRICT_REGISTRY あり → 地区別 storageFolderId を厳格解決
  if (cleanDistrictId && registryRaw) {
    let registry = {};
    try {
      registry = JSON.parse(registryRaw);
    } catch (errP) {
      console.error("[DriveAdapter] Failed to parse DISTRICT_REGISTRY JSON:", errP);
      throw new Error("[DriveAdapter] DISTRICT_REGISTRY is corrupted.");
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

  // 2. districtId あり + DISTRICT_REGISTRY なし → 旧単一地区互換として既存 STORAGE_PARENT_ID fallback を維持
  // 3. districtId なし → P1 #2-B完了までは既存Scheduler互換として STORAGE_PARENT_ID を維持
  const id = props.getProperty("STORAGE_PARENT_ID");
  return id || (typeof CONFIG !== 'undefined' ? CONFIG.STORAGE_PARENT_ID : null);
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
