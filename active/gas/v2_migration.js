/**
 * v2_migration.js
 * Backend -> Dashboard Identity連携 スキーマ拡張 & データ移行プロトコル
 * 
 * 原則:
 * 1. 既存列を移動・削除・変更せず、末尾に新設列を append
 *    - 保有チラシ枚数: G列 (lineUserId)
 *    - 配布実績: P列 (16列目 lineUserId)
 *    - 掲示板: E列 (lineUserId)
 *    - 受渡要請履歴: 13列目 (requesterLineUserId), 14列目 (holderLineUserId)
 * 2. 既存データ行の補完は「staffId と名前が名簿と完全一致し、一意に確定できる行のみ」
 * 3. 矛盾・不一致・不明な行（例: ST001: staffId=S001, name=K. IWASA）は空欄のまま保全し、推測で補正しない。
 */

function migrateIdentityColumns(isDryRun) {
  if (typeof isDryRun === 'undefined') isDryRun = true;
  const ss = (typeof getSS === 'function') ? getSS() : (typeof SpreadsheetApp !== 'undefined' ? SpreadsheetApp.getActiveSpreadsheet() : null);
  if (!ss) {
    return { success: false, message: "Spreadsheet not found" };
  }

  const report = {
    isDryRun: isDryRun,
    sheets: {},
    summary: { updatedRows: 0, skippedRows: 0, headersAdded: 0 }
  };

  // 1. 名簿の取得
  let roster = [];
  try {
    if (typeof StaffRepository !== 'undefined' && StaffRepository.getInstance) {
      roster = StaffRepository.getInstance().findAll() || [];
    } else {
      const rSheet = (typeof MonthlySheetResolver !== 'undefined') ? MonthlySheetResolver.getInstance().getCurrentSheet("staff") : ss.getSheetByName("スタッフ名簿");
      if (rSheet && rSheet.getLastRow() >= 2) {
        const rVals = rSheet.getRange(2, 1, rSheet.getLastRow() - 1, 4).getValues();
        roster = rVals.map(r => ({ id: String(r[0] || '').trim(), name: String(r[1] || '').trim(), lineUserId: String(r[2] || '').trim() }));
      }
    }
  } catch (eRoster) {
    return { success: false, message: "Failed to load roster: " + eRoster.toString() };
  }

  // 2. 「保有チラシ枚数」シートのマイグレーション
  try {
    const flyerSheet = (typeof MonthlySheetResolver !== 'undefined') ? MonthlySheetResolver.getInstance().getCurrentSheet("flyer") : ss.getSheetByName("保有チラシ枚数");
    if (flyerSheet) {
      const lr = flyerSheet.getLastRow();
      const lc = flyerSheet.getLastColumn();
      const sheetReport = { name: flyerSheet.getName(), headerAdded: false, rowsUpdated: [], rowsSkipped: [] };

      // G列（7列目）ヘッダー確認・追加
      if (lc < 7 || String(flyerSheet.getRange(1, 7).getValue()).trim() !== "lineUserId") {
        sheetReport.headerAdded = true;
        if (!isDryRun) {
          flyerSheet.getRange(1, 7).setValue("lineUserId");
          flyerSheet.getRange(1, 7).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        }
        report.summary.headersAdded++;
      }

      if (lr >= 2) {
        const numCols = Math.max(lc, 7);
        const vals = flyerSheet.getRange(2, 1, lr - 1, numCols).getValues();
        for (let i = 0; i < vals.length; i++) {
          const rowNum = i + 2;
          const recId = vals[i][0];
          const staffId = String(vals[i][1] || '').trim();
          const staffName = String(vals[i][2] || '').trim();
          const existingLineId = String(vals[i][6] || '').trim();

          if (existingLineId) {
            sheetReport.rowsSkipped.push({ row: rowNum, id: recId, reason: "Already has lineUserId" });
            continue;
          }

          // 名簿照合: staffId と名前の双方が完全一致する場合のみ特定
          const matched = roster.filter(m => m.id === staffId && m.name === staffName);
          if (matched.length === 1 && matched[0].lineUserId) {
            sheetReport.rowsUpdated.push({ row: rowNum, id: recId, staffId: staffId, name: staffName, lineUserId: matched[0].lineUserId });
            if (!isDryRun) {
              flyerSheet.getRange(rowNum, 7).setValue(matched[0].lineUserId);
            }
            report.summary.updatedRows++;
          } else {
            // ST001 のように矛盾がある、または一意に確定できない場合は空欄のまま保全
            const reason = matched.length === 0 ? "Staff ID and Name mismatch or not in roster" : "Multiple roster matches";
            sheetReport.rowsSkipped.push({ row: rowNum, id: recId, staffId: staffId, name: staffName, reason: reason });
            report.summary.skippedRows++;
          }
        }
      }
      report.sheets["flyer"] = sheetReport;
    }
  } catch (eFlyer) {
    report.sheets["flyer"] = { error: eFlyer.toString() };
  }

  // 3. 「配布実績」シートのマイグレーション
  try {
    const distSheet = (typeof MonthlySheetResolver !== 'undefined') ? MonthlySheetResolver.getInstance().getCurrentSheet("distribution") : ss.getSheetByName("配布実績");
    if (distSheet) {
      const lr = distSheet.getLastRow();
      const lc = distSheet.getLastColumn();
      const sheetReport = { name: distSheet.getName(), headerAdded: false, rowsUpdated: [], rowsSkipped: [] };

      // P列（16列目）ヘッダー確認・追加
      if (lc < 16 || String(distSheet.getRange(1, 16).getValue()).trim() !== "lineUserId") {
        sheetReport.headerAdded = true;
        if (!isDryRun) {
          distSheet.getRange(1, 16).setValue("lineUserId");
          distSheet.getRange(1, 16).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        }
        report.summary.headersAdded++;
      }

      if (lr >= 2) {
        const numCols = Math.max(lc, 16);
        const vals = distSheet.getRange(2, 1, lr - 1, numCols).getValues();
        for (let i = 0; i < vals.length; i++) {
          const rowNum = i + 2;
          const rowId = vals[i][0];
          const completedAt = vals[i][3];
          const staffId = String(vals[i][5] || '').trim();
          const staffName = String(vals[i][6] || '').trim();
          const existingLineId = String(vals[i][15] || '').trim();

          if (!completedAt || !staffId) continue;
          if (existingLineId) {
            sheetReport.rowsSkipped.push({ row: rowNum, id: rowId, reason: "Already has lineUserId" });
            continue;
          }

          const matched = roster.filter(m => m.id === staffId && m.name === staffName);
          if (matched.length === 1 && matched[0].lineUserId) {
            sheetReport.rowsUpdated.push({ row: rowNum, id: rowId, staffId: staffId, name: staffName, lineUserId: matched[0].lineUserId });
            if (!isDryRun) {
              distSheet.getRange(rowNum, 16).setValue(matched[0].lineUserId);
            }
            report.summary.updatedRows++;
          } else {
            sheetReport.rowsSkipped.push({ row: rowNum, id: rowId, staffId: staffId, name: staffName, reason: "Mismatch or unresolved" });
            report.summary.skippedRows++;
          }
        }
      }
      report.sheets["distribution"] = sheetReport;
    }
  } catch (eDist) {
    report.sheets["distribution"] = { error: eDist.toString() };
  }

  // 4. 「掲示板」シートのマイグレーション
  try {
    const bSheet = ss.getSheetByName("掲示板");
    if (bSheet) {
      const lr = bSheet.getLastRow();
      const lc = bSheet.getLastColumn();
      const sheetReport = { name: bSheet.getName(), headerAdded: false, rowsUpdated: [], rowsSkipped: [] };

      // E列（5列目）ヘッダー確認・追加
      if (lc < 5 || String(bSheet.getRange(1, 5).getValue()).trim() !== "lineUserId") {
        sheetReport.headerAdded = true;
        if (!isDryRun) {
          bSheet.getRange(1, 5).setValue("lineUserId");
          bSheet.getRange(1, 5).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        }
        report.summary.headersAdded++;
      }

      if (lr >= 2) {
        const numCols = Math.max(lc, 5);
        const vals = bSheet.getRange(2, 1, lr - 1, numCols).getValues();
        for (let i = 0; i < vals.length; i++) {
          const rowNum = i + 2;
          const staffId = String(vals[i][1] || '').trim();
          const staffName = String(vals[i][2] || '').trim();
          const existingLineId = String(vals[i][4] || '').trim();

          if (existingLineId) {
            sheetReport.rowsSkipped.push({ row: rowNum, reason: "Already has lineUserId" });
            continue;
          }

          const matched = roster.filter(m => m.id === staffId && m.name === staffName);
          if (matched.length === 1 && matched[0].lineUserId) {
            sheetReport.rowsUpdated.push({ row: rowNum, staffId: staffId, name: staffName, lineUserId: matched[0].lineUserId });
            if (!isDryRun) {
              bSheet.getRange(rowNum, 5).setValue(matched[0].lineUserId);
            }
            report.summary.updatedRows++;
          } else {
            sheetReport.rowsSkipped.push({ row: rowNum, staffId: staffId, name: staffName, reason: "Mismatch or unresolved" });
            report.summary.skippedRows++;
          }
        }
      }
      report.sheets["bulletin"] = sheetReport;
    }
  } catch (eB) {
    report.sheets["bulletin"] = { error: eB.toString() };
  }

  // 5. 「受渡要請履歴」シートのマイグレーション
  try {
    const trSheet = (typeof MonthlySheetResolver !== 'undefined') ? MonthlySheetResolver.getInstance().getCurrentSheet("transfer") : ss.getSheetByName("受渡要請履歴");
    if (trSheet) {
      const lc = trSheet.getLastColumn();
      const sheetReport = { name: trSheet.getName(), headerAdded: false };

      // 列13, 14 ヘッダー確認・追加
      if (lc < 14 || String(trSheet.getRange(1, 13).getValue()).trim() !== "requesterLineUserId") {
        sheetReport.headerAdded = true;
        if (!isDryRun) {
          trSheet.getRange(1, 13, 1, 2).setValues([["requesterLineUserId", "holderLineUserId"]]);
          trSheet.getRange(1, 13, 1, 2).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        }
        report.summary.headersAdded++;
      }
      report.sheets["transfer"] = sheetReport;
    }
  } catch (eTr) {
    report.sheets["transfer"] = { error: eTr.toString() };
  }

  report.success = true;
  return report;
}
