/**
 * Business Layer - Flyer Repository Module
 * 
 * Domain: Flyer Domain
 * Layer: Business Layer
 * Responsibility: 「保有チラシ枚数」Spreadsheet への読込・書き込みカプセル化
 */

if (typeof FlyerRepository === 'undefined') {
  FlyerRepository = class FlyerRepository {
    constructor() {
      this.spreadsheetAdapter = (typeof SpreadsheetAdapter !== 'undefined') ? new SpreadsheetAdapter() : null;
    }

    static getInstance() {
      if (!FlyerRepository.instance) {
        FlyerRepository.instance = new FlyerRepository();
      }
      return FlyerRepository.instance;
    }

    getStorageSheet() {
      if (typeof MonthlySheetResolver !== 'undefined' && MonthlySheetResolver.getInstance) {
        return MonthlySheetResolver.getInstance().getCurrentSheet("flyer");
      }
      return null;
    }

    findAllStocks() {
      const s = this.getStorageSheet();
      if (!s) return [];

      const lastRow = s.getLastRow();
      if (lastRow < 2) return [];

      const values = s.getRange(2, 1, lastRow - 1, 6).getValues();
      return values.map(r => ({
        id: r[0],
        staffId: r[1],
        staffName: r[2],
        location: r[3],
        count: parseFloat(r[4]) || 0,
        updatedAt: (r[5] && typeof r[5].getMonth === 'function') ? Utilities.formatDate(r[5], "JST", "MM/dd HH:mm") : (r[5] ? String(r[5]).trim() : "")
      }));
    }

    updateStock(location, count, staffName, staffId) {
      const cleanStaffId = String(staffId || "").trim();
      const cleanStaffName = String(staffName || "").trim();
      if (!cleanStaffId || !cleanStaffName) {
        return { success: false, code: "INVALID_ARGUMENT", message: "Staff info required" };
      }
      
      const lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
      } catch (e) {
        throw new Error("Lock timeout");
      }

      try {
        const s = this.getStorageSheet();
        if (!s) return { success: false, message: "Storage sheet unavailable" };

        const lastRow = s.getLastRow();
        const now = new Date();
        const updatedAt = Utilities.formatDate(now, "JST", "MM/dd HH:mm");

        let values = [];
        if (lastRow >= 2) {
          values = s.getRange(2, 1, lastRow - 1, 6).getValues();
        }

        let targetRow = 0;
        for (let i = 0; i < values.length; i++) {
          if (values[i][1] === staffId) {
            targetRow = i + 2;
            break;
          }
        }

        if (targetRow > 0) {
          // updateStock() は現在保有しているチラシ枚数および保管場所を最新の入力値で保存する。加算・減算・差分計算は一切行わない。
          const finalCount = count;
          s.getRange(targetRow, 3, 1, 4).setValues([[staffName, location, finalCount, updatedAt]]);
        } else {
          const newRow = lastRow + 1;
          const newId = "ST" + String(newRow - 1).padStart(3, '0');
          s.getRange(newRow, 1, 1, 6).setValues([[newId, staffId, staffName, location, count, updatedAt]]);
        }
        return { success: true };
      } finally {
        lock.releaseLock();
      }
    }
  };
  FlyerRepository.instance = null;
}
