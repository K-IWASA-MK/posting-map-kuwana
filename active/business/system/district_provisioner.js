/**
 * POSTING MAP - District Provisioner (Generation 2)
 * 責務: 新地区作成時の「CSV → 原本5種 → 当月5種」一括生成、および月替わり自動生成
 * 
 * 【厳格な制約】
 * 1. 責務は「原本5種生成」「CSVエリア展開」「当月5種生成（原本からの複製）」「月次トリガー管理」のみ。
 * 2. MonthlySheetResolverとは完全に責務分離する（Resolverは参照解決SSOT、Provisionerが生成SSOT）。
 * 3. 前月シートは一切削除せず、履歴として保持する。
 * 4. SYSTEM_INFOは月次化対象外・固定保護。
 * 5. 地区名・自治体名・件数はコードにハードコードせず、CSVおよびSpreadsheetから動的に決定する。
 */
(function(global) {
  class DistrictProvisioner {
    constructor() {
      this.masterNames = {
        distribution: "配布実績の原本",
        staff: "名簿の原本",
        flyer: "保有チラシ枚数の原本",
        transfer: "受渡要請履歴の原本",
        pin: "PinStatusの原本"
      };

      this.prefixes = {
        distribution: "配布実績",
        staff: "名簿",
        flyer: "保有チラシ枚数",
        transfer: "受渡要請履歴",
        pin: "PinStatus"
      };
    }

    static getInstance() {
      if (!DistrictProvisioner.instance) {
        DistrictProvisioner.instance = new DistrictProvisioner();
      }
      return DistrictProvisioner.instance;
    }

    getSS(districtId = "") {
      const cleanDistrictId = String(districtId || "").trim().toUpperCase();
      if (typeof getSS === 'function') {
        return getSS(cleanDistrictId);
      } else if (typeof SpreadsheetApp !== 'undefined' && typeof SpreadsheetApp.getActiveSpreadsheet === 'function') {
        return SpreadsheetApp.getActiveSpreadsheet();
      }
      throw new Error("SpreadsheetApp is unavailable");
    }

    /**
     * 新地区作成時の一括プロビジョニング
     * address_master.csv のデータを受け取り、原本5種 ➔ 当月5種 を一括生成する
     * 
     * @param {Array<Object>} addresses - CSVからパースしたエリア配列 [{ rowId, cityName, townName }, ...]
     * @param {Object} [options={}] - オプション（provisioningToken, targetSpreadsheetId 等）
     * @param {string} [districtId=""] - 対象地区コード
     * @return {Object} 結果オブジェクト { success: true, count: number, month: string }
     */
    provisionNewDistrict(addresses, options = {}, districtId = "") {
      if (!Array.isArray(addresses) || addresses.length === 0) {
        return {
          success: false,
          code: "INVALID_ARGUMENT",
          message: "addresses must be a non-empty array of address master records."
        };
      }

      const token = options && options.provisioningToken;
      const tokenCheck = typeof verifyProvisioningToken === 'function'
        ? verifyProvisioningToken(token)
        : { success: false, code: "UNAUTHORIZED", message: "verifyProvisioningToken unavailable" };
      if (!tokenCheck.success) {
        return tokenCheck;
      }

      const cleanDistrictId = String(districtId || (options && options.districtId) || "").trim().toUpperCase();

      let ss = null;
      if (options && options.spreadsheet) {
        ss = options.spreadsheet;
      } else if (options && (options.targetSpreadsheetId || options.spreadsheetId)) {
        const explicitId = String(options.targetSpreadsheetId || options.spreadsheetId).trim();
        if (explicitId && typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.openById) {
          ss = SpreadsheetApp.openById(explicitId);
        }
      } else {
        ss = this.getSS(cleanDistrictId);
      }

      if (!ss) {
        throw new Error(`[DistrictProvisioner] Target spreadsheet cannot be resolved for district "${cleanDistrictId}".`);
      }

      const districtName = (ss.getName() || '').trim();
      const invalidNames = [
        '無題のスプレッドシート',
        '無題',
        'untitled spreadsheet',
        'untitled',
        '新規スプレッドシート',
        'スプレッドシート'
      ];
      const lowerName = districtName.toLowerCase();
      const isInvalidName = !districtName ||
        invalidNames.some(inv => lowerName === inv || lowerName.startsWith('copy of') || lowerName.startsWith('のコピー'));

      if (isInvalidName) {
        return {
          success: false,
          code: "INVALID_DISTRICT_NAME",
          message: `Spreadsheet name "${districtName}" is invalid. Please rename your spreadsheet to the target district code (e.g. <TARGET_DISTRICT_CODE>) before provisioning.`
        };
      }

      // Provisioning Integrity Guard: 要求地区コードとスプレッドシート名の照合（指定時）
      if (cleanDistrictId && districtName) {
        const cleanName = districtName.toUpperCase();
        if (!cleanName.includes(cleanDistrictId) && !cleanDistrictId.includes(cleanName)) {
          console.warn(`[DistrictProvisioner] Warning: districtId "${cleanDistrictId}" differs from spreadsheet name "${districtName}".`);
        }
      }

      // 内部伝播用に options.spreadsheet をセット
      options.spreadsheet = ss;

      const lock = LockService.getScriptLock();
      lock.waitLock(30000);

      try {
        const now = new Date();
        let jstIso = "";
        let currentMonthStr = "";
        if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
          jstIso = Utilities.formatDate(now, "JST", "yyyy-MM-dd HH:mm:ss");
          currentMonthStr = Utilities.formatDate(now, "JST", "yyyy-MM");
        } else {
          const jst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
          jstIso = jst.toISOString().replace('T', ' ').slice(0, 19);
          currentMonthStr = jst.toISOString().slice(0, 7);
        }

        const operationMode = String(options.operationMode || 'ELECTION').trim().toUpperCase();
        const activeDatasetKey = String(options.activeDatasetKey || currentMonthStr).trim();
        options.operationMode = operationMode;
        options.activeDatasetKey = activeDatasetKey;
        if (!options.contractStartDate) {
          options.contractStartDate = jstIso;
        }

        // 1. 実運用5シートを直接生成 (All-or-Nothing)
        const datasetResult = this.createOperationalDataset(ss, activeDatasetKey, addresses);

        // 2. SYSTEM_INFO 同期（5シート生成成功後に ACTIVE 化）
        let sysInfoResult = null;
        if (options && options.skipSystemInfo === true) {
          sysInfoResult = {
            success: true,
            sheetName: 'SYSTEM_INFO',
            districtName: cleanDistrictId || districtName,
            skipped: true
          };
        } else {
          sysInfoResult = (typeof SystemInfoService !== 'undefined' && SystemInfoService.getInstance)
            ? SystemInfoService.getInstance().syncSystemInfo(options, cleanDistrictId)
            : this.createOrSyncSystemInfo(ss, options);
        }

        // 1地区用 Core のみを呼出し、既存他地区の PinStatus に一切触れない（他地区 Pin mutation 0 保証）
        if (typeof cleanupPinStatusForDistrict === 'function') {
          cleanupPinStatusForDistrict(cleanDistrictId);
        } else if (typeof cleanupPinStatusDaily === 'function') {
          cleanupPinStatusDaily();
        }

        if (typeof setupPinStatusCleanupTrigger === 'function') {
          setupPinStatusCleanupTrigger();
        }
        this.setupMonthlyTrigger();

        SpreadsheetApp.flush();

        const types = ['distribution', 'staff', 'flyer', 'transfer', 'pin'];
        const monthlySheets = types.map(t => `${this.prefixes[t]}${activeDatasetKey}`);

        const allSheets = [
          "SYSTEM_INFO",
          ...monthlySheets
        ];

        return {
          success: true,
          message: `District provisioned successfully in ${operationMode} mode.`,
          districtName: (sysInfoResult && sysInfoResult.districtName) || districtName,
          operationMode: operationMode,
          activeDatasetKey: activeDatasetKey,
          sheets: allSheets,
          totalSheetsCount: allSheets.length,
          count: Array.isArray(addresses) ? addresses.length : 0,
          month: activeDatasetKey,
          triggersConfigured: true,
          dailyCleanupExecuted: true,
          skipSystemInfo: !!(options && options.skipSystemInfo === true)
        };
      } finally {
        lock.releaseLock();
      }
    }

    /**
     * 公式空データベーステンプレートの自動生成
     * コピー元Spreadsheetから不要シート削除・データクリア・SYSTEM_INFO初期化を行い、
     * 指定されたマスター保管フォルダへ POSTING_MAP_EMPTY_TEMPLATE を生成する
     *
     * @param {string} sourceSpreadsheetId - コピー元Spreadsheet ID（非ハードコード）
     * @param {string} targetFolderId - 格納先フォルダID
     * @param {Object} options - オプション（provisioningToken等）
     * @return {Object} 結果オブジェクト { success: boolean, templateId: string, templateUrl: string, sheets: Array }
     */
    createEmptyTemplate(sourceSpreadsheetId, targetFolderId, options) {
      if (!sourceSpreadsheetId) {
        return { success: false, code: "INVALID_ARGUMENT", message: "sourceSpreadsheetId is required." };
      }
      if (!targetFolderId) {
        return { success: false, code: "INVALID_ARGUMENT", message: "targetFolderId is required." };
      }

      const token = options && options.provisioningToken;
      const tokenCheck = typeof verifyProvisioningToken === 'function'
        ? verifyProvisioningToken(token)
        : { success: false, code: "UNAUTHORIZED", message: "verifyProvisioningToken unavailable" };
      if (!tokenCheck.success) {
        return tokenCheck;
      }

      const lock = LockService.getScriptLock();
      lock.waitLock(30000);

      try {
        const folder = DriveApp.getFolderById(targetFolderId);
        const sourceFile = DriveApp.getFileById(sourceSpreadsheetId);
        const templateName = "POSTING_MAP_EMPTY_TEMPLATE";

        const existingFiles = folder.getFilesByName(templateName);
        while (existingFiles.hasNext()) {
          const oldFile = existingFiles.next();
          oldFile.setTrashed(true);
        }

        const newFile = sourceFile.makeCopy(templateName, folder);
        const newSS = SpreadsheetApp.openById(newFile.getId());

        const keepSheetNames = [
          "SYSTEM_INFO",
          "端末管理"
        ];

        const allCurrentSheets = newSS.getSheets();
        allCurrentSheets.forEach(sheet => {
          const sName = sheet.getName();
          if (!keepSheetNames.includes(sName)) {
            newSS.deleteSheet(sheet);
          }
        });

        const sysSheet = newSS.getSheetByName("SYSTEM_INFO");
        if (sysSheet) {
          const lr = sysSheet.getLastRow();
          if (lr >= 2) {
            sysSheet.getRange(2, 2, lr - 1, 1).clearContent();
          }
        }

        SpreadsheetApp.flush();

        const finalSheets = newSS.getSheets().map(s => ({
          name: s.getName(),
          lastRow: s.getLastRow(),
          lastColumn: s.getLastColumn(),
          dataRows: Math.max(0, s.getLastRow() - 1)
        }));

        return {
          success: true,
          message: "POSTING_MAP_EMPTY_TEMPLATE created successfully.",
          templateId: newFile.getId(),
          templateUrl: newFile.getUrl(),
          targetFolderId: targetFolderId,
          sourceSpreadsheetId: sourceSpreadsheetId,
          sheetsCount: finalSheets.length,
          sheets: finalSheets
        };
      } finally {
        lock.releaseLock();
      }
    }

    /**
     * 公式空テンプレートから新地区スプレッドシートDBを複製・生成
     *
     * @param {string} templateSpreadsheetId - 複製元EMPTY TEMPLATE ID
     * @param {string} targetDistrictName - 新地区名（例: "OKAYAMA-02"）
     * @param {string} targetFolderId - 格納先フォルダID (例: 03_BRANCH/OKAYAMA-02)
     * @param {Object} options - オプション（provisioningToken等）
     * @return {Object} 結果オブジェクト { success, spreadsheetId, spreadsheetUrl, districtName, sheetsCount, sheets }
     */
    createDistrictDatabase(templateSpreadsheetId, targetDistrictName, targetFolderId, options) {
      if (!templateSpreadsheetId) {
        return { success: false, code: "INVALID_ARGUMENT", message: "templateSpreadsheetId is required." };
      }
      if (!targetDistrictName) {
        return { success: false, code: "INVALID_ARGUMENT", message: "targetDistrictName is required." };
      }
      if (!targetFolderId) {
        return { success: false, code: "INVALID_ARGUMENT", message: "targetFolderId is required." };
      }

      const token = options && options.provisioningToken;
      const tokenCheck = typeof verifyProvisioningToken === 'function'
        ? verifyProvisioningToken(token)
        : { success: false, code: "UNAUTHORIZED", message: "verifyProvisioningToken unavailable" };
      if (!tokenCheck.success) {
        return tokenCheck;
      }

      const lock = LockService.getScriptLock();
      lock.waitLock(30000);

      try {
        const folder = DriveApp.getFolderById(targetFolderId);
        const templateFile = DriveApp.getFileById(templateSpreadsheetId);

        // 格納先フォルダ内の同名スプレッドシートがあればゴミ箱へ退避
        const existingFiles = folder.getFilesByName(targetDistrictName);
        while (existingFiles.hasNext()) {
          const oldFile = existingFiles.next();
          oldFile.setTrashed(true);
        }

        // EMPTY TEMPLATE から複製し新地区名を設定
        const newFile = templateFile.makeCopy(targetDistrictName, folder);
        const newSS = SpreadsheetApp.openById(newFile.getId());

        SpreadsheetApp.flush();

        const finalSheets = newSS.getSheets().map(s => ({
          name: s.getName(),
          lastRow: s.getLastRow(),
          lastColumn: s.getLastColumn(),
          dataRows: Math.max(0, s.getLastRow() - 1)
        }));

        return {
          success: true,
          message: `District database "${targetDistrictName}" created successfully from template.`,
          spreadsheetId: newFile.getId(),
          spreadsheetUrl: newFile.getUrl(),
          districtName: targetDistrictName,
          targetFolderId: targetFolderId,
          templateSpreadsheetId: templateSpreadsheetId,
          sheetsCount: finalSheets.length,
          sheets: finalSheets
        };
      } finally {
        lock.releaseLock();
      }
    }

    createOrSyncSystemInfo(ss, options) {
      if (typeof SystemInfoService !== 'undefined' && SystemInfoService.getInstance) {
        return SystemInfoService.getInstance().syncSystemInfo(options);
      }
      const opts = options || {};
      const sheetName = "SYSTEM_INFO";
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      const districtName = ss.getName();
      const subdomain = districtName.toLowerCase();
      const baseUrl = (opts.baseUrl && opts.baseUrl !== "https://postingmap.jp")
        ? opts.baseUrl
        : `https://${subdomain}.postingmap.jp`;
      const hAppUrl = `${baseUrl}/`;
      const dashboardUrl = `${baseUrl}/active/manager/`;

      let liffUrl = opts.productionLiffUrl || "";
      let liffId = opts.liffId || "";
      if (!liffId && liffUrl) {
        const match = String(liffUrl).match(/liff\.line\.me\/([^/?#]+)/i);
        if (match && match[1]) {
          liffId = match[1];
        }
      }
      if (!liffId && typeof PropertiesService !== 'undefined') {
        try {
          const props = PropertiesService.getScriptProperties();
          liffId = props.getProperty("LINE_LIFF_ID") || props.getProperty("LIFF_ID") || "";
          if (liffId && !liffUrl) {
            liffUrl = `https://liff.line.me/${liffId}`;
          }
        } catch (e) {}
      }

      let managerPassword = opts.managerPassword || "";
      if (!managerPassword && sheet) {
        try {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            const data = sheet.getRange(1, 1, lastRow, 2).getValues();
            for (let i = 0; i < data.length; i++) {
              if (data[i][0] === "Manager認証パスワード" && data[i][1]) {
                managerPassword = String(data[i][1]).trim();
                break;
              }
            }
          }
        } catch (e) {}
      }
      if (!managerPassword) {
        managerPassword = String(Math.floor(100000 + Math.random() * 900000));
      }

      let contractEndDate = opts.contractEndDate || "";
      if (!contractEndDate && sheet) {
        try {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            const data = sheet.getRange(1, 1, lastRow, 2).getValues();
            for (let i = 0; i < data.length; i++) {
              if (data[i][0] === "契約終了日" && data[i][1]) {
                const val = data[i][1];
                if (val instanceof Date) {
                  if (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function') {
                    contractEndDate = Utilities.formatDate(val, "JST", "yyyy-MM-dd");
                  } else {
                    const jst = new Date(val.getTime() + (9 * 60 * 60 * 1000));
                    contractEndDate = jst.toISOString().slice(0, 10);
                  }
                } else {
                  contractEndDate = String(val).trim().replace(/\//g, '-');
                }
                break;
              }
            }
          }
        } catch (e) {}
      }

      const headers = [["項目", "内容"]];
      const rows = [
        ["地区コード", districtName],
        ["地区名", districtName],
        ["HアプリURL", hAppUrl],
        ["Dashboard URL", dashboardUrl],
        ["LIFFアプリ名", `POSTING MAP ${districtName}`],
        ["LIFF ID", liffId],
        ["LIFF URL", liffUrl],
        ["Endpoint URL", hAppUrl],
        ["Manager認証パスワード", managerPassword],
        ["状態", "ACTIVE"],
        ["契約終了日", contractEndDate]
      ];

      const currentLr = sheet.getLastRow();
      if (currentLr >= 2) {
        sheet.getRange(2, 1, currentLr - 1, 2).clearContent();
      }

      sheet.getRange(1, 1, 1, 2).setValues(headers);
      sheet.getRange("A1:B1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      sheet.getRange(2, 1, rows.length, 2).setValues(rows);
      sheet.getRange(`A2:A${rows.length + 1}`).setFontWeight("bold");
      sheet.setFrozenRows(1);

      return {
        success: true,
        sheet: sheetName,
        districtName: districtName,
        rowCount: rows.length
      };
    }

    /**
     * GitHub Pages 等の静的配信から address_master.csv を取得してパースする
     */
    loadDistrictAddresses(districtId = "") {
      const cleanDistrictId = String(districtId || "").trim().toUpperCase();
      let baseUrl = "";
      if (cleanDistrictId) {
        baseUrl = `https://${cleanDistrictId.toLowerCase()}.postingmap.jp`;
      }
      if (!baseUrl && typeof window !== 'undefined' && window.PMS_CLIENT_CONFIG && window.PMS_CLIENT_CONFIG.baseUrl) {
        baseUrl = window.PMS_CLIENT_CONFIG.baseUrl;
      }
      if (!baseUrl) {
        throw new Error("[DistrictProvisioner] Base URL cannot be determined for loading address_master.csv. districtId is required.");
      }

      const csvUrl = `${baseUrl.replace(/\/+$/, '')}/data/address_master.csv`;
      console.log(`[DistrictProvisioner] Loading address master from: ${csvUrl}`);

      let csvText = "";
      if (typeof UrlFetchApp !== 'undefined' && UrlFetchApp.fetch) {
        const resp = UrlFetchApp.fetch(csvUrl, { muteHttpExceptions: true });
        if (resp.getResponseCode() !== 200) {
          throw new Error(`Failed to fetch address_master.csv from ${csvUrl}: HTTP ${resp.getResponseCode()}`);
        }
        csvText = resp.getContentText();
      } else {
        throw new Error("UrlFetchApp is unavailable to load address_master.csv");
      }

      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length <= 1) {
        throw new Error(`address_master.csv at ${csvUrl} is empty or contains only header.`);
      }

      const header = lines[0].split(',').map(h => h.trim());
      const rowIdIdx = header.indexOf('rowId');
      const cityIdx = header.indexOf('cityName');
      const townIdx = header.indexOf('townName');

      const addresses = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length >= 3) {
          addresses.push({
            rowId: rowIdIdx >= 0 ? Number(cols[rowIdIdx]) : i,
            cityName: cityIdx >= 0 ? cols[cityIdx] : cols[1],
            townName: townIdx >= 0 ? cols[townIdx] : cols[2]
          });
        }
      }
      return addresses;
    }

    /**
     * 実運用5シート（配布実績, 名簿, 保有チラシ枚数, 受渡要請履歴, PinStatus）を直接生成する
     * All-or-Nothing 物理的補償削除（Compensating Rollback）を保証
     */
    createOperationalDataset(ss, datasetKey, addresses) {
      if (!ss) throw new Error("Spreadsheet is required for createOperationalDataset");
      if (!datasetKey) throw new Error("datasetKey is required for createOperationalDataset");
      if (!Array.isArray(addresses) || addresses.length === 0) {
        throw new Error("addresses must be a non-empty array for createOperationalDataset");
      }

      const types = ['distribution', 'staff', 'flyer', 'transfer', 'pin'];
      const targetSheetNames = types.map(t => `${this.prefixes[t]}${datasetKey}`);

      // 1. 事前存在検証 (0/5, 5/5, 1〜4/5)
      const existing = [];
      const missing = [];
      targetSheetNames.forEach(name => {
        if (ss.getSheetByName(name)) {
          existing.push(name);
        } else {
          missing.push(name);
        }
      });

      if (existing.length === 5) {
        return {
          success: true,
          datasetKey: datasetKey,
          created: [],
          noop: true
        };
      }

      if (existing.length > 0 && existing.length < 5) {
        throw new Error(`[DistrictProvisioner] Partial dataset sheets detected (${existing.length}/5) for ${datasetKey}: ${existing.join(', ')}. Aborting creation to prevent silent corruption.`);
      }

      // 0/5: 生成開始。生成したシート名を記録し、失敗時に補償削除
      const createdInThisRun = [];
      try {
        // ① 配布実績 (17列)
        const distName = `${this.prefixes.distribution}${datasetKey}`;
        const distSheet = ss.insertSheet(distName);
        createdInThisRun.push(distSheet);

        const distHeaders = [
          ["ID", "市町村", "町域", "配布完了日時", "配布枚数", "担当者ID", "担当者名", "GPS", "写真", "緯度", "経度", "GPS日時", "写真ファイルID", "写真URL", "写真日時", "lineUserId", "requestId"]
        ];
        distSheet.getRange(1, 1, 1, 17).setValues(distHeaders);
        distSheet.getRange("A1:Q1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        distSheet.setFrozenRows(1);

        const distRows = addresses.map((addr, idx) => {
          const rowId = addr.rowId !== undefined ? addr.rowId : (idx + 1);
          const city = addr.cityName || addr.city_name || "";
          const town = addr.townName || addr.town_name || "";
          return [rowId, city, town, "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
        });
        distSheet.getRange(2, 1, distRows.length, 17).setValues(distRows);

        // ② 名簿 (4列)
        const staffName = `${this.prefixes.staff}${datasetKey}`;
        const staffSheet = ss.insertSheet(staffName);
        createdInThisRun.push(staffSheet);
        const staffHeaders = [["ID", "名前", "LINE_USER_ID", "登録日時"]];
        staffSheet.getRange(1, 1, 1, 4).setValues(staffHeaders);
        staffSheet.getRange("A1:D1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        staffSheet.setFrozenRows(1);

        // ③ 保有チラシ枚数 (7列)
        const flyerName = `${this.prefixes.flyer}${datasetKey}`;
        const flyerSheet = ss.insertSheet(flyerName);
        createdInThisRun.push(flyerSheet);
        const flyerHeaders = [["ID", "担当者ID", "担当者名", "保管場所", "保有枚数", "最終更新日時", "lineUserId"]];
        flyerSheet.getRange(1, 1, 1, 7).setValues(flyerHeaders);
        flyerSheet.getRange("A1:G1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        flyerSheet.setFrozenRows(1);

        // ④ 受渡要請履歴 (14列)
        const transferName = `${this.prefixes.transfer}${datasetKey}`;
        const transferSheet = ss.insertSheet(transferName);
        createdInThisRun.push(transferSheet);
        const transferHeaders = [["日時", "要請者", "要請者ID", "保管者", "保管者ID", "連絡方法", "連絡先", "状態", "requestId", "LINE送信状態", "LINE HTTP status", "LINE送信日時", "requesterLineUserId", "holderLineUserId"]];
        transferSheet.getRange(1, 1, 1, 14).setValues(transferHeaders);
        transferSheet.getRange("A1:N1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        transferSheet.setFrozenRows(1);

        // ⑤ PinStatus (2列)
        const pinName = `${this.prefixes.pin}${datasetKey}`;
        const pinSheet = ss.insertSheet(pinName);
        createdInThisRun.push(pinSheet);
        const pinHeaders = [["rowId", "status"]];
        pinSheet.getRange(1, 1, 1, 2).setValues(pinHeaders);
        pinSheet.getRange("A1:B1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
        pinSheet.setFrozenRows(1);

        SpreadsheetApp.flush();

        return {
          success: true,
          datasetKey: datasetKey,
          created: targetSheetNames
        };
      } catch (err) {
        // 補償ロールバック: 今回作成したシートのみを削除して 0/5 へ巻き戻す
        console.error(`[DistrictProvisioner] Error during createOperationalDataset for ${datasetKey}. Rolling back newly created sheets:`, err);
        createdInThisRun.forEach(s => {
          try {
            ss.deleteSheet(s);
          } catch (delErr) {
            console.error(`[DistrictProvisioner] Failed to rollback sheet ${s.getName()}:`, delErr);
          }
        });
        SpreadsheetApp.flush();
        throw err;
      }
    }

    /**
     * 原本5種の生成・初期化
     */
    createMasterSheets(ss, addresses) {
      // 1. 配布実績の原本 (全エリアを展開)
      this.createDistributionMaster(ss, addresses);

      // 2. 名簿の原本 (ヘッダーのみ、0行)
      this.createStaffMaster(ss);

      // 3. 保有チラシ枚数の原本 (ヘッダーのみ、0行)
      this.createFlyerMaster(ss);

      // 4. 受渡要請履歴の原本 (ヘッダーのみ、0行)
      this.createTransferMaster(ss);

      // 5. PinStatusの原本 (ヘッダーのみ、0行)
      this.createPinMaster(ss);
    }

    /**
     * 配布実績の原本
     * A〜P列: [ID, 市町村, 町域, 配布完了日時, 配布枚数, 担当者ID, 担当者名, GPS, 写真, 緯度, 経度, GPS日時, 写真ファイルID, 写真URL, 写真日時, lineUserId]
     */
    createDistributionMaster(ss, addresses) {
      const masterName = this.masterNames.distribution;
      let sheet = ss.getSheetByName(masterName);
      if (!sheet) {
        sheet = ss.insertSheet(masterName);
      }

      const headers = [
        ["ID", "市町村", "町域", "配布完了日時", "配布枚数", "担当者ID", "担当者名", "GPS", "写真", "緯度", "経度", "GPS日時", "写真ファイルID", "写真URL", "写真日時", "lineUserId"]
      ];
      sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
      sheet.getRange("A1:P1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1);

      if (Array.isArray(addresses) && addresses.length > 0) {
        const rows = addresses.map((addr, idx) => {
          const rowId = addr.rowId !== undefined ? addr.rowId : (idx + 1);
          const city = addr.cityName || addr.city_name || "";
          const town = addr.townName || addr.town_name || "";
          return [rowId, city, town, "", "", "", "", "", "", "", "", "", "", "", "", ""];
        });

        // 既存の古い行があればクリア
        const currentLr = sheet.getLastRow();
        if (currentLr >= 2) {
          sheet.getRange(2, 1, currentLr - 1, 16).clearContent();
        }

        // CSVから動的展開
        sheet.getRange(2, 1, rows.length, 16).setValues(rows);
      }
    }

    /**
     * 名簿の原本
     * A〜D列: [ID, 名前, LINE_USER_ID, 登録日時]
     */
    createStaffMaster(ss) {
      const masterName = this.masterNames.staff;
      let sheet = ss.getSheetByName(masterName);
      if (!sheet) {
        sheet = ss.insertSheet(masterName);
      }
      const headers = [["ID", "名前", "LINE_USER_ID", "登録日時"]];
      sheet.getRange(1, 1, 1, 4).setValues(headers);
      sheet.getRange("A1:D1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    /**
     * 保有チラシ枚数の原本
     * A〜G列: [ID, 担当者ID, 担当者名, 保管場所, 保有枚数, 最終更新日時, lineUserId]
     */
    createFlyerMaster(ss) {
      const masterName = this.masterNames.flyer;
      let sheet = ss.getSheetByName(masterName);
      if (!sheet) {
        sheet = ss.insertSheet(masterName);
      }
      const headers = [["ID", "担当者ID", "担当者名", "保管場所", "保有枚数", "最終更新日時", "lineUserId"]];
      sheet.getRange(1, 1, 1, 7).setValues(headers);
      sheet.getRange("A1:G1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    /**
     * 受渡要請履歴の原本
     * A〜N列: [日時, 要請者, 要請者ID, 保管者, 保管者ID, 連絡方法, 連絡先, 状態, requestId, LINE送信状態, LINE HTTP status, LINE送信日時, requesterLineUserId, holderLineUserId]
     */
    createTransferMaster(ss) {
      const masterName = this.masterNames.transfer;
      let sheet = ss.getSheetByName(masterName);
      if (!sheet) {
        sheet = ss.insertSheet(masterName);
      }
      const headers = [["日時", "要請者", "要請者ID", "保管者", "保管者ID", "連絡方法", "連絡先", "状態", "requestId", "LINE送信状態", "LINE HTTP status", "LINE送信日時", "requesterLineUserId", "holderLineUserId"]];
      sheet.getRange(1, 1, 1, 14).setValues(headers);
      sheet.getRange("A1:N1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    /**
     * PinStatusの原本
     * A〜B列: [rowId, status]
     */
    createPinMaster(ss) {
      const masterName = this.masterNames.pin;
      let sheet = ss.getSheetByName(masterName);
      if (!sheet) {
        sheet = ss.insertSheet(masterName);
      }
      const headers = [["rowId", "status"]];
      sheet.getRange(1, 1, 1, 2).setValues(headers);
      sheet.getRange("A1:B1").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    /**
     * 原本5種から当月5種を生成・複製する
     * 過去月シートは履歴として保持し、絶対に削除しない。
     * 
     * 状態機械（State Machine）:
     * - 0/5 存在: 原本から新規月として生成（原本16列 + 当月Q列 requestId付与）
     * - 5/5 存在: 完全 No-op（書込・クリア・既存ヘッダー補完の全API呼出が0回）
     * - 1〜4/5 存在: Fail-Closed 即時停止（PARTIAL_MONTHLY_SHEETS_CORRUPTION、mutation 0）
     * 
     * @param {string} [targetMonth] - 生成対象年月 (YYYY-MM)。未指定時は現在月。
     * @param {Object} [options] - オプション
     * @return {Object} 結果 { success: boolean, month: string, created: string[], noop?: boolean, code?: string }
     */
    rolloverMonthlySheets(targetMonth, options = {}, districtId = "") {
      const cleanDistrictId = String(districtId || (options && options.districtId) || "").trim().toUpperCase();
      let ss = null;
      if (options && options.spreadsheet) {
        ss = options.spreadsheet;
      } else if (options && (options.targetSpreadsheetId || options.spreadsheetId)) {
        const explicitId = String(options.targetSpreadsheetId || options.spreadsheetId).trim();
        if (explicitId && typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.openById) {
          ss = SpreadsheetApp.openById(explicitId);
        }
      } else {
        ss = this.getSS(cleanDistrictId);
      }

      if (!ss) {
        throw new Error(`[DistrictProvisioner] Target spreadsheet cannot be resolved for district "${cleanDistrictId}".`);
      }

      // 0. 運用モードの解決 (ELECTION vs SUBSCRIPTION)
      let operationMode = "SUBSCRIPTION";
      const sysSheet = ss.getSheetByName("SYSTEM_INFO");
      if (sysSheet && typeof SystemInfoService !== 'undefined' && SystemInfoService.getInstance) {
        try {
          operationMode = SystemInfoService.getInstance().getOperationMode(sysSheet);
        } catch (e) {
          operationMode = "SUBSCRIPTION";
        }
      }

      // ELECTION モード: 月次ロールオーバーは完全 No-op (mutation 0)
      if (operationMode === "ELECTION") {
        console.log(`[DistrictProvisioner] ELECTION mode detected for district "${cleanDistrictId}". Monthly rollover skipped (mutation 0).`);
        return {
          success: true,
          month: targetMonth || "",
          created: [],
          noop: true,
          mode: "ELECTION"
        };
      }

      const month = targetMonth || (
        typeof MonthlySheetResolver !== 'undefined' && MonthlySheetResolver.getInstance
          ? MonthlySheetResolver.getInstance().getCurrentMonth()
          : (typeof Utilities !== 'undefined' && typeof Utilities.formatDate === 'function' ? Utilities.formatDate(new Date(), "JST", "yyyy-MM") : new Date().toISOString().slice(0, 7))
      );

      const types = ['distribution', 'staff', 'flyer', 'transfer', 'pin'];
      const existingMonthlySheets = [];
      const missingMonthlySheets = [];

      // 1. 事前存在判定（mutation 0 の状態で全5シートを走査）
      types.forEach(type => {
        const monthlyName = `${this.prefixes[type]}${month}`;
        const sheet = ss.getSheetByName(monthlyName);
        if (sheet) {
          existingMonthlySheets.push(monthlyName);
        } else {
          missingMonthlySheets.push(monthlyName);
        }
      });

      const existingCount = existingMonthlySheets.length;

      // 2. 5/5 の場合: 完全 No-op（書込API呼出そのものが0回）
      if (existingCount === 5) {
        return {
          success: true,
          month: month,
          created: [],
          noop: true,
          mode: "SUBSCRIPTION"
        };
      }

      // 3. 1〜4/5 の場合: Fail-Closed で即時停止（mutation 0）
      if (existingCount > 0 && existingCount < 5) {
        return {
          success: false,
          code: "PARTIAL_MONTHLY_SHEETS_CORRUPTION",
          message: `Partial monthly sheets detected (${existingCount}/5) for ${month}. Missing: ${missingMonthlySheets.join(', ')}. Existing: ${existingMonthlySheets.join(', ')}. Provisioning halted to prevent silent corruption.`,
          month: month,
          existingSheets: existingMonthlySheets,
          missingSheets: missingMonthlySheets,
          created: [],
          mode: "SUBSCRIPTION"
        };
      }

      // 4. 0/5 の場合: 新規月として直接生成 (All-or-Nothing)
      let addresses = (options && options.addresses) || null;
      if (!Array.isArray(addresses) || addresses.length === 0) {
        try {
          addresses = this.loadDistrictAddresses(cleanDistrictId);
        } catch (eCsv) {
          // Fallback: 既存の原本配布実績が存在すれば、その A〜C 列から抽出
          const masterDist = ss.getSheetByName(this.masterNames.distribution);
          if (masterDist && masterDist.getLastRow() >= 2) {
            const numRows = masterDist.getLastRow() - 1;
            const vals = masterDist.getRange(2, 1, numRows, 3).getValues();
            addresses = vals.map((r, idx) => ({
              rowId: (r[0] !== "" && r[0] !== undefined) ? r[0] : (idx + 1),
              cityName: r[1] || "",
              townName: r[2] || ""
            }));
          } else {
            throw eCsv;
          }
        }
      }

      const datasetRes = this.createOperationalDataset(ss, month, addresses);
      return {
        success: true,
        month: month,
        created: datasetRes.created,
        mode: "SUBSCRIPTION"
      };
    }

    /**
     * 毎月1日 0:00 JST に rolloverMonthlySheets を実行する時間主導型トリガーを設定
     */
    setupMonthlyTrigger() {
      if (typeof deleteTriggers === 'function') {
        deleteTriggers("rolloverMonthlySheetsDailyCheck");
      }
      ScriptApp.newTrigger("rolloverMonthlySheetsDailyCheck")
        .timeBased()
        .everyDays(1)
        .atHour(0)
        .create();
      console.log("rolloverMonthlySheetsDailyCheck trigger set: daily at 0:00 AM JST");
    }
  }

  DistrictProvisioner.instance = null;
  global.DistrictProvisioner = DistrictProvisioner;
})(this);
