/**
 * GAS v2 - バッチ処理モジュール
 * - Drive写真自動整理・保管管理
 * - PinStatus 日次クリーンアップ
 * - トリガー管理
 *
 * ※ 旧世代の個別エリアシート生成(forceStartBatch, generateAreaSheetsBatch)および
 *    旧月末全消去方式(checkEndOfMonthAndReset)は、DistrictProvisioner への全面移行に伴い完全撤去されました。
 */

// =============================================
// ① トリガー共通管理
// =============================================

function deleteTriggers(name) {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === name) ScriptApp.deleteTrigger(t);
  });
}

// =============================================
// ② Drive写真 自動整理バッチ
// - 90日超: /evidence → /archive へ移動
// - 180日超: /archive 内ファイルをゴミ箱へ
// =============================================

/**
 * 1地区を対象としたDrive写真の自動整理
 * @param {string} districtId
 */
function cleanupDrivePhotosForDistrict(districtId) {
  let parentFolderId;
  try {
    parentFolderId = getStorageFolderId(districtId);
  } catch (eFolder) {
    console.warn(`cleanupDrivePhotosForDistrict: Storage folder resolution failed for district "${districtId}":`, eFolder);
    return;
  }

  if (!parentFolderId) {
    console.warn(`cleanupDrivePhotosForDistrict: Storage folder not found for district "${districtId}".`);
    return;
  }

  let parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(parentFolderId);
  } catch (e) {
    console.error(`cleanupDrivePhotosForDistrict: parent folder not found for district "${districtId}":`, e);
    return;
  }

  const now = new Date();
  const MS_90_DAYS  = 90  * 24 * 60 * 60 * 1000;
  const MS_180_DAYS = 180 * 24 * 60 * 60 * 1000;

  // --- /evidence フォルダを取得 ---
  const evidenceFolders = parentFolder.getFoldersByName("evidence");
  if (evidenceFolders.hasNext()) {
    const evidenceFolder = evidenceFolders.next();

    // /archive フォルダを取得または作成
    const archiveFolders = parentFolder.getFoldersByName("archive");
    let archiveFolder;
    if (archiveFolders.hasNext()) {
      archiveFolder = archiveFolders.next();
    } else {
      archiveFolder = parentFolder.createFolder("archive");
    }

    // 90日以上経過したファイルを /archive へ移動
    const evidenceFiles = evidenceFolder.getFiles();
    let movedCount = 0;
    while (evidenceFiles.hasNext()) {
      const file = evidenceFiles.next();
      const age = now - file.getDateCreated();
      if (age > MS_90_DAYS) {
        file.moveTo(archiveFolder);
        movedCount++;
      }
    }
    if (movedCount > 0) {
      console.log(`cleanupDrivePhotosForDistrict [${districtId}]: ${movedCount} files moved to /archive`);
    }
  }

  // --- /archive フォルダを取得 ---
  const archiveFolders2 = parentFolder.getFoldersByName("archive");
  if (archiveFolders2.hasNext()) {
    const archiveFolder = archiveFolders2.next();

    // 180日以上経過したファイルをゴミ箱へ
    const archiveFiles = archiveFolder.getFiles();
    let deletedCount = 0;
    while (archiveFiles.hasNext()) {
      const file = archiveFiles.next();
      const age = now - file.getDateCreated();
      if (age > MS_180_DAYS) {
        file.setTrashed(true);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      console.log(`cleanupDrivePhotosForDistrict [${districtId}]: ${deletedCount} files trashed from /archive`);
    }
  }
}

/**
 * Googleドライブの証拠写真を自動整理する時間主導型トリガー実行エントリ。
 * setupCleanupTrigger() で毎日深夜2時に自動実行される。
 * 有効な全地区を列挙し、地区ごとに完全隔離して実行する。
 */
function cleanupDrivePhotos() {
  const enabledDistricts = (typeof SpreadsheetResolver !== 'undefined' && SpreadsheetResolver.getInstance)
    ? SpreadsheetResolver.getInstance().getEnabledDistricts()
    : null;

  if (enabledDistricts === null) {
    // Legacy 未設定環境
    cleanupDrivePhotosForDistrict("");
    return;
  }

  if (enabledDistricts.length === 0) {
    // configured-empty または全地区 disabled: 実行 0 件（Fail-Closed、global fallback 禁止）
    console.log("cleanupDrivePhotos: No enabled districts found in DISTRICT_REGISTRY. Halting.");
    return;
  }

  enabledDistricts.forEach((d) => {
    try {
      cleanupDrivePhotosForDistrict(d);
    } catch (errDist) {
      console.error(`cleanupDrivePhotos failed for district "${d}":`, errDist);
    }
  });
}

/**
 * cleanupDrivePhotos の時間主導型トリガーを設定する。
 * GASエディタから手動で1回だけ実行すること。
 * 既存トリガーを削除してから新規作成するため、重複しない。
 */
function setupCleanupTrigger() {
  deleteTriggers("cleanupDrivePhotos");
  ScriptApp.newTrigger("cleanupDrivePhotos")
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  console.log("cleanupDrivePhotos trigger set: daily at 2:00 AM JST");
}

/**
 * 1地区を対象とした30日経過写真の自動削除
 * @param {string} districtId
 */
function cleanupOldPhotosForDistrict(districtId) {
  let folderId;
  try {
    folderId = (typeof getStorageFolderId === 'function') ? getStorageFolderId(districtId) : null;
  } catch (eFolder) {
    console.warn(`cleanupOldPhotosForDistrict: Storage folder resolution failed for district "${districtId}":`, eFolder);
    return;
  }

  if (!folderId) {
    console.warn(`cleanupOldPhotosForDistrict: Storage folder not found for district "${districtId}".`);
    return;
  }

  try {
    const folder = DriveApp.getFolderById(folderId);
    const now = new Date();
    const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

    // 写真専用フォルダ直下のファイルのみを走査
    const files = folder.getFiles();
    let trashedCount = 0;
    while (files.hasNext()) {
      const file = files.next();
      const age = now - file.getDateCreated();
      if (age > MS_30_DAYS && !file.isTrashed()) {
        file.setTrashed(true);
        trashedCount++;
      }
    }

    console.log(`cleanupOldPhotosForDistrict [${districtId}]: ${trashedCount} old photos moved to trash.`);
  } catch(e) {
    console.error(`cleanupOldPhotosForDistrict [${districtId}] error:`, e);
  }
}

/**
 * C-5 Field Result Sync Foundation
 * 30日経過写真の自動削除バッチ時間主導型トリガー実行エントリ。
 */
function cleanupOldPhotosBatch() {
  const enabledDistricts = (typeof SpreadsheetResolver !== 'undefined' && SpreadsheetResolver.getInstance)
    ? SpreadsheetResolver.getInstance().getEnabledDistricts()
    : null;

  if (enabledDistricts === null) {
    // Legacy 未設定環境
    cleanupOldPhotosForDistrict("");
    return;
  }

  if (enabledDistricts.length === 0) {
    console.log("cleanupOldPhotosBatch: No enabled districts found in DISTRICT_REGISTRY. Halting.");
    return;
  }

  enabledDistricts.forEach((d) => {
    try {
      cleanupOldPhotosForDistrict(d);
    } catch (errDist) {
      console.error(`cleanupOldPhotosBatch failed for district "${d}":`, errDist);
    }
  });
}

/**
 * 30日削除バッチの時間主導型トリガーを設定する
 */
function setupPhotoCleanupTrigger() {
  deleteTriggers("cleanupOldPhotosBatch");
  ScriptApp.newTrigger("cleanupOldPhotosBatch")
    .timeBased()
    .everyDays(1)
    .atHour(3) // 3 AM JST
    .create();
  console.log("cleanupOldPhotosBatch trigger set: daily at 3:00 AM JST");
}

// =============================================
// ③ PinStatus 日次クリーンアップ
// =============================================

/**
 * 1地区を対象とした PinStatus クリーンアップ（1地区用 Core）
 * 対象地区の当月 PinStatus シートに残存した IN_PROGRESS データをクリアする。
 * 配布実績シートを含む他シートおよび他地区のシートには一切アクセス・変更しない。
 * @param {string} districtId
 */
function cleanupPinStatusForDistrict(districtId) {
  try {
    let pinSheet = null;
    if (typeof MonthlySheetResolver !== 'undefined' && MonthlySheetResolver.getInstance) {
      pinSheet = MonthlySheetResolver.getInstance().getCurrentSheet("pin", districtId);
    }
    if (!pinSheet) {
      console.log(`cleanupPinStatusForDistrict [${districtId}]: PinStatus sheet does not exist. Nothing to clear.`);
      return;
    }

    const lr = pinSheet.getLastRow();
    if (lr <= 1) {
      console.log(`cleanupPinStatusForDistrict [${districtId}]: PinStatus sheet has no data rows. Nothing to clear.`);
      return;
    }

    const lock = LockService.getScriptLock();
    if (lock.tryLock(10000)) {
      try {
        pinSheet.deleteRows(2, lr - 1);
        SpreadsheetApp.flush();
        console.log(`cleanupPinStatusForDistrict [${districtId}]: PinStatus cleared successfully (${lr - 1} rows cleared, header preserved).`);
      } finally {
        lock.releaseLock();
      }
    } else {
      console.warn(`cleanupPinStatusForDistrict [${districtId}]: Could not obtain lock.`);
    }
  } catch (e) {
    console.error(`cleanupPinStatusForDistrict [${districtId}] error: ` + e.toString());
  }
}

/**
 * PinStatus 日次クリーンアップ時間主導型トリガー実行エントリ。
 * 毎日0:00頃の時間主導型トリガーから実行。
 * 有効な全地区を列挙し、地区ごとに cleanupPinStatusForDistrict を呼出す。
 */
function cleanupPinStatusDaily() {
  const enabledDistricts = (typeof SpreadsheetResolver !== 'undefined' && SpreadsheetResolver.getInstance)
    ? SpreadsheetResolver.getInstance().getEnabledDistricts()
    : null;

  if (enabledDistricts === null) {
    // Legacy 未設定環境
    cleanupPinStatusForDistrict("");
    return;
  }

  if (enabledDistricts.length === 0) {
    console.log("cleanupPinStatusDaily: No enabled districts found in DISTRICT_REGISTRY. Halting.");
    return;
  }

  enabledDistricts.forEach((d) => {
    try {
      cleanupPinStatusForDistrict(d);
    } catch (errDist) {
      console.error(`cleanupPinStatusDaily failed for district "${d}":`, errDist);
    }
  });
}

/**
 * PinStatus 日次クリーンアップの時間主導型トリガーを設定する
 * 既存の同名トリガーを削除してから新規登録（多重登録防止）
 * 毎日 0:00 (午前0時〜1時) に1回実行
 */
function setupPinStatusCleanupTrigger() {
  deleteTriggers("cleanupPinStatusDaily");
  ScriptApp.newTrigger("cleanupPinStatusDaily")
    .timeBased()
    .everyDays(1)
    .atHour(0) // 0:00 AM JST
    .create();
  console.log("cleanupPinStatusDaily trigger set: daily at 0:00 AM JST");
}

/**
 * 名簿および名簿の原本シートを初期化・再構築
 * (M-01: v2_ui.js から移設)
 * @param {string} [districtId=""]
 */
function setupRosterSheet(districtId = "") {
  const ss = (typeof getSS === 'function') ? getSS(districtId) : (typeof SpreadsheetApp !== 'undefined' ? SpreadsheetApp.getActiveSpreadsheet() : null);
  if (typeof DistrictProvisioner !== 'undefined' && DistrictProvisioner.getInstance) {
    DistrictProvisioner.getInstance().createStaffMaster(ss);
    DistrictProvisioner.getInstance().rolloverMonthlySheets(null, {}, districtId);
    return "名簿の原本および当月名簿を4列新SSOT構造で再構築しました。";
  }
  return "DistrictProvisioner not available";
}

/**
 * 日次トリガーから実行される月次判定・自動生成関数
 * (M-02: v2_ui.js から移設)
 */
function rolloverMonthlySheetsDailyCheck() {
  const enabledDistricts = (typeof SpreadsheetResolver !== 'undefined' && SpreadsheetResolver.getInstance)
    ? SpreadsheetResolver.getInstance().getEnabledDistricts()
    : null;

  if (enabledDistricts === null) {
    // Legacy 未設定環境
    if (typeof DistrictProvisioner !== 'undefined' && DistrictProvisioner.getInstance) {
      DistrictProvisioner.getInstance().rolloverMonthlySheets(null, {}, "");
    }
    return;
  }

  if (enabledDistricts.length === 0) {
    console.log("rolloverMonthlySheetsDailyCheck: No enabled districts found in DISTRICT_REGISTRY. Halting.");
    return;
  }

  enabledDistricts.forEach((d) => {
    try {
      if (typeof DistrictProvisioner !== 'undefined' && DistrictProvisioner.getInstance) {
        DistrictProvisioner.getInstance().rolloverMonthlySheets(null, {}, d);
      }
    } catch (errDist) {
      console.error(`rolloverMonthlySheetsDailyCheck failed for district "${d}":`, errDist);
    }
  });
}
