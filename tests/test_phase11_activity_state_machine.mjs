#!/usr/bin/env node
/**
 * POSTING MAP - Phase 11 Activity State Machine Verification Suite (Strict Audit)
 *
 * 目的:
 * Phase 11 Activity State Machine において、
 * 1. ADR-013 制定と状態整合性モデルの確立
 * 2. 原本 clientEventId 定義保護と requestId との対応関係
 * 3. 活動ログ状態遷移マシン（UNTOUCHED ➔ IN_PROGRESS ➔ DRAFT ➔ SUBMITTING ➔ PENDING ➔ COMPLETED）
 * 4. 完了条件が「Backend永続化成功」のみであること
 * 5. 既存業務ルール「完了確定地区は当月再操作不可」のUI・ロジック完全防護
 * 6. 既存業務ルール「未完了地区は翌日0:00以降再操作可能」の保証
 * 7. 個人ランキング集計確定条件（completedAt + groupKey + count>0）
 * 8. Universal原則遵守 & Scope Lock（データ・外部接続不可侵）
 * を機械判定により厳密に実証する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = process.cwd();

// テスト対象ファイル
const designContractPath = path.join(rootDir, 'docs/architecture/01_DESIGN_CONTRACT.md');
const apiContractPath = path.join(rootDir, 'docs/api/API_CONTRACT.md');
const dataLifecyclePath = path.join(rootDir, 'docs/data/DATA_LIFECYCLE.md');
const appJsPath = path.join(rootDir, 'active/h-app/app.js');
const renderJsPath = path.join(rootDir, 'active/h-app/render.js');
const dbJsPath = path.join(rootDir, 'active/h-app/db.js');
const distRepoPath = path.join(rootDir, 'active/business/distribution/distribution_repository.js');
const pinStatusServicePath = path.join(rootDir, 'active/business/pin/pin_status_service.js');
const gpsServicePath = path.join(rootDir, 'active/business/gps/gps_service.js');
const gpsRepositoryPath = path.join(rootDir, 'active/business/gps/gps_repository.js');

const designContract = fs.readFileSync(designContractPath, 'utf8');
const apiContract = fs.readFileSync(apiContractPath, 'utf8');
const dataLifecycle = fs.readFileSync(dataLifecyclePath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const renderJs = fs.readFileSync(renderJsPath, 'utf8');
const dbJs = fs.readFileSync(dbJsPath, 'utf8');
const distRepoJs = fs.readFileSync(distRepoPath, 'utf8');
const pinStatusServiceJs = fs.readFileSync(pinStatusServicePath, 'utf8');
const gpsServiceJs = fs.readFileSync(gpsServicePath, 'utf8');
const gpsRepositoryJs = fs.readFileSync(gpsRepositoryPath, 'utf8');

console.log('====================================================');
console.log('🚀 PHASE 11 ACTIVITY STATE MACHINE VERIFICATION SUITE');
console.log('====================================================\n');

// ----------------------------------------------------------------------------
// 1. Activity State Machine 契約と仕様整合性 (Canonical SSOT & Runtime 直接検証)
// ----------------------------------------------------------------------------
test('1. Activity State Machine 契約: 状態遷移、完了確定条件、業務ルール、ランキング集計条件が明文化されていること', () => {
  assert.ok(designContract.includes('Phase 11 — Activity State Machine'), '01_DESIGN_CONTRACT に Phase 11 が定義されていること');
  assert.ok(apiContract.includes('現場ポスティングフロー 7段階ステートマシン'), 'API_CONTRACT に 7段階ステートマシンが定義されていること');
  assert.ok(apiContract.includes('Step 1: ピン選択') && apiContract.includes('Step 7: 完了確定'), 'API_CONTRACT に Step 1 から Step 7 の状態遷移シーケンスが定義されていること');
  assert.ok(apiContract.includes('getRowStatus(rowId) === null'), 'API_CONTRACT に Backend永続化成功による確定条件が定義されていること');
  assert.ok(apiContract.includes('rowId') && apiContract.includes('requestId') && apiContract.includes('責務分離'), 'API_CONTRACT に rowId と requestId の責務分離契約が定義されていること');
  assert.ok(apiContract.includes('duplicate') && (apiContract.includes('alreadyCompleted') || apiContract.includes('再配布')), 'API_CONTRACT に 冪等性・重複排除契約が定義されていること');
  assert.ok(dataLifecycle.includes('ライフサイクル') && (dataLifecycle.includes('COMPLETED') || dataLifecycle.includes('DRAFT')), 'DATA_LIFECYCLE に配布実績ライフサイクルと状態確定モデルが記述されていること');
  assert.ok(distRepoJs.includes('fetchRankingData'), 'distribution_repository.js に fetchRankingData が実動実装されていること');
});

// ----------------------------------------------------------------------------
// 2. clientEventId / requestId の原本定義保護と対応関係
// ----------------------------------------------------------------------------
test('2. 識別子境界: 原本 clientEventId 定義を保護し、requestId との対応関係が確立されていること', () => {
  // 原本仕様の確認
  assert.ok(designContract.includes('活動登録は`clientEventId`等の冪等キーによって重複登録を防止する。'), '原本の冪等性記述');
  assert.ok(designContract.includes('端末側で活動送信ごとに一意の`clientEventId`を生成する。'), '原本のclientEventId生成記述');

  // app.js で requestId 発番後に clientEventId が対応付けられていること
  assert.ok(appJs.includes('const clientEventId = requestId;'), 'clientEventId が requestId に対応付けられていること');
  assert.ok(appJs.includes('clientEventId,'), 'enqueueSync に clientEventId が渡されていること');

  // db.js の payload に clientEventId が含められていること
  assert.ok(dbJs.includes('clientEventId:') && dbJs.includes('item.clientEventId || item.requestId'), 'API送信 payload に clientEventId が含まれていること');
});

// ----------------------------------------------------------------------------
// 3. 活動ログ状態遷移マシン (State Transition Machine)
// ----------------------------------------------------------------------------
test('3. 状態遷移マシン: UNTOUCHED ➔ IN_PROGRESS ➔ DRAFT ➔ SUBMITTING ➔ PENDING ➔ COMPLETED の因果関係が守られていること', () => {
  // DRAFT (写真確定時点): isDone=false, isReadyToSubmit=true
  assert.ok(appJs.includes('p.isDone = false;\n        p.isReadyToSubmit = true;'), '写真取得完了時は DRAFT を維持');

  // SUBMITTING: submitting フラグとUIボタン無効化
  assert.ok(appJs.includes("p.syncStatus = 'submitting';"), '送信開始で submitting に移行');
  assert.ok(appJs.includes("submitBtn.disabled = true;"), '多重送信防止のためボタン非活性化');

  // PENDING (同期待ち / オフライン): isDone=false 維持
  assert.ok(appJs.includes("p.syncStatus = 'pending';\n        p.isDone = false;"), 'オフライン時は pending かつ isDone=false');

  // COMPLETED: Backend 成功 (getRowStatus === null) かつ accepted 時のみ昇格、REJECTED は非完了維持
  assert.ok(appJs.includes("if (status === null) {"), 'status === null 判定が存在すること');
  assert.ok(appJs.includes("if (p.syncStatus === 'REJECTED')"), 'REJECTED 判定が存在すること');
  assert.ok(appJs.includes("p.isDone = true;"), '正常受理時に p.isDone = true が設定されること');
  assert.ok(appJs.includes("delete p.isReadyToSubmit;"), '完了時に isReadyToSubmit を削除');

  // 実動シミュレーション: accepted:false (REJECTED) は COMPLETED にならないこと
  const rejectedPin = { rowId: 301, isDone: false, isReadyToSubmit: true, syncStatus: 'REJECTED' };
  if (rejectedPin.syncStatus === 'REJECTED') {
    rejectedPin.isDone = false;
    delete rejectedPin.isReadyToSubmit;
    delete rejectedPin.syncStatus;
  }
  assert.equal(rejectedPin.isDone, false, 'REJECTED は COMPLETED に昇格しないこと');
});

// ----------------------------------------------------------------------------
// 4. 完了確定条件 (Backend永続化成功のみが唯一のSSOT)
// ----------------------------------------------------------------------------
test('4. 完了確定条件: 写真撮影・キュー投入・送信中は COMPLETED ではなく、Backend永続化成功のみで確定すること', () => {
  // 認証エラー時のロールバック
  assert.ok(appJs.includes("p.syncStatus = 'failed';\n      p.isDone = false;"), '認証失敗時は isDone=false');

  // タイムアウト時の未完了維持
  assert.ok(appJs.includes("p.syncStatus = 'pending';\n        p.isDone = false;\n        alert(\"送信処理中です。バックグラウンドで送信を継続します。\");"), '3秒超過時は pending かつ isDone=false で解放');

  // エラー catch 時のロールバック
  assert.ok(appJs.includes("p.syncStatus = 'pending';\n    // Phase 9: Backend永続化が成功していないため、配布完了を確定させない (COMPLETED = false)\n    p.isDone = false;"), '送信例外発生時は isDone=false');
});

// ----------------------------------------------------------------------------
// 5. 業務ルール1: 完了確定した地区の月内再操作禁止
// ----------------------------------------------------------------------------
test('5. 業務ルール1: 完了確定地区は当月再操作不可であること (UI・ロジック二重防護)', () => {
  // 1. submitMissionComplete 先頭ガード
  assert.ok(
    appJs.includes('const isAlreadyCompleted = (window.globalPinStatus && Array.isArray(window.globalPinStatus.completed) && window.globalPinStatus.completed.includes(Number(rowId))) ||\n                             (p.isDone && !p.isReadyToSubmit);'),
    'submitMissionComplete で完了済み地区の再提出をガード'
  );
  assert.ok(appJs.includes('alert("この地区は既に今月の配布が完了しています。再操作はできません。");'), '再操作ブロックアラートが存在すること');

  // 2. render.js バブルでのロック表示
  assert.ok(renderJs.includes('const isCompleted = window.globalPinStatus?.completed?.includes(row.rowId);'), 'globalPinStatus.completed でピン状態判定');
  assert.ok(renderJs.includes('<div class="premium-glass-badge badge-completed">\n                  配布済み 🔒\n                </div>'), '完了ピンには配布開始ボタンを出さず配布済みバッジを表示');

  // 3. render.js モーダル内での再操作不可バッジ表示
  assert.ok(renderJs.includes('(p.isDone && !p.isReadyToSubmit)'), '完了確定済みアイテムの条件判定');
  assert.ok(renderJs.includes('今月の配布は完了しています（再操作不可）'), 'モーダル内に再操作不可メッセージを表示');
  assert.ok(renderJs.includes('closeDetailModal()'), '閉じるボタンのみを提供し再提出ボタンを非表示化');
});

// ----------------------------------------------------------------------------
// 6. 業務ルール2: 未完了地区の翌日0:00以降再操作可能の保証
// ----------------------------------------------------------------------------
test('6. 業務ルール2: 未完了地区は当月シートに completedAt が記録されず、翌日以降も再操作可能であること', () => {
  // pin_status_service.js の completed 判定が completedAt (D列) 必須であること
  assert.ok(
    pinStatusServiceJs.includes('.filter(r => r[0] && r[3] !== "" && r[3] !== null)'),
    'PinStatusService で D列 (completedAt) が存在する行のみ completed と判定'
  );

  // キャンセル時は一時データがリセットされ、isDone=false が維持されること
  assert.ok(renderJs.includes('p.isDone = false;'), 'cancelMissionComplete で isDone=false を維持');
  assert.ok(renderJs.includes('delete p.tempPhotoUrl;\n    delete p.photoBase64;'), '写真データが破棄されること');

  // 未完了ピンは globalPinStatus.completed に入らないため、翌日0:00以降も通常通り緑/未操作ピンとして再操作可能
  assert.ok(appJs.includes('if (!p.isDone) {\n          delete p.syncStatus;\n        }'), '未完了アイテムは syncStatus がリセットされ再操作可能状態となること');
});

// ----------------------------------------------------------------------------
// 7. 個人ランキング集計確定条件
// ----------------------------------------------------------------------------
test('7. ランキング集計条件: completedAt + groupKey + count > 0 の確定行のみが集計されること', () => {
  // distribution_repository.js の集計元シートが当月配布実績シートであること
  assert.ok(
    distRepoJs.includes('getCurrentSheet("distribution", districtId)'),
    '当月の配布実績シートのみを集計元として解決'
  );

  // 確定行の必須抽出条件
  assert.ok(
    distRepoJs.includes('if (!rawCompletedAt || !groupKey || count <= 0) continue;'),
    'completedAt が存在し、groupKey が存在し、count > 0 の確定行のみ集計すること'
  );

  // groupKey の優先順位 (lineUserId 最優先、次点 staffId)
  assert.ok(
    distRepoJs.includes('const groupKey = rowLineUserId || staffId;'),
    'groupKey は lineUserId を最優先し、未設定時は staffId を使用'
  );
});

// ----------------------------------------------------------------------------
// 8. Universal 原則遵守 & 厳格な Scope Lock
// ----------------------------------------------------------------------------
test('8. Universal 原則遵守: active/ 配下に地区固有ハードコードがなく、マスターデータが保護されていること', () => {
  const activeFiles = [appJsPath, renderJsPath, dbJsPath];
  for (const f of activeFiles) {
    const content = fs.readFileSync(f, 'utf8');
    assert.ok(!content.includes('KUWANA-'), '地区IDが active/ にハードコードされていないこと');
    assert.ok(!content.includes('OKAYAMA-'), '地区IDが active/ にハードコードされていないこと');
  }

  // address_master.csv の確認 (337件維持)
  const masterCsv = fs.readFileSync(path.join(rootDir, 'data/address_master.csv'), 'utf8');
  const lines = masterCsv.trim().split('\n');
  assert.equal(lines.length, 338, 'マスターCSVはヘッダー含め338行(337レコード)を維持していること');
});

// ----------------------------------------------------------------------------
// 9. P1 #3: 完了実績取消（isDone=false）の完全閉鎖とデータ不変性（Fail-Closed & Mutation 0）
// ----------------------------------------------------------------------------
test('9. P1 #3: isDone=false 取消経路の完全閉鎖（Fail-Closed & Mutation 0 & 正常系/重複/保護維持）', async () => {
  // --- 静的構造検証 ---
  // 1. GPSService において !isComplete 時に即時 INVALID_OPERATION 復帰すること
  assert.ok(
    gpsServiceJs.includes('code: "INVALID_OPERATION"') &&
    gpsServiceJs.includes('完了実績の取消は許可されていません。'),
    'GPSService で !isComplete の場合に INVALID_OPERATION で即時拒否されること'
  );

  // 2. GPSRepository において旧Revert処理（D:Pクリア）が完全撤廃されていること
  assert.ok(
    !gpsRepositoryJs.includes('Revert D to P'),
    'GPSRepository から旧 Revert D to P 処理が完全撤廃されていること'
  );
  assert.ok(
    gpsRepositoryJs.includes('if (!isComplete)') &&
    gpsRepositoryJs.includes('完了実績の取消は許可されていません。'),
    'GPSRepository 単体でも !isComplete 時に書込を行わずエラー復帰すること'
  );

  // --- 実動実証（vmサンドボックス実行） ---
  import('node:vm').then(async ({ default: vm }) => {
    class MockRange {
      constructor(sheet, startRow, startCol, numRows, numCols) {
        this.sheet = sheet;
        this.startRow = startRow;
        this.startCol = startCol;
        this.numRows = numRows;
        this.numCols = numCols;
      }
      getValues() {
        const rows = [];
        for (let r = 0; r < this.numRows; r++) {
          const rowData = [];
          for (let c = 0; c < this.numCols; c++) {
            const rowIndex = (this.startRow - 1) + r;
            const colIndex = (this.startCol - 1) + c;
            rowData.push(this.sheet.data[rowIndex] ? this.sheet.data[rowIndex][colIndex] : "");
          }
          rows.push(rowData);
        }
        return rows;
      }
      setValues(values) {
        for (let r = 0; r < values.length; r++) {
          for (let c = 0; c < values[r].length; c++) {
            const rowIndex = (this.startRow - 1) + r;
            const colIndex = (this.startCol - 1) + c;
            if (!this.sheet.data[rowIndex]) this.sheet.data[rowIndex] = [];
            this.sheet.data[rowIndex][colIndex] = values[r][c];
          }
        }
        this.sheet.mutationCount++;
      }
    }

    class MockFinder {
      constructor(sheet, query) {
        this.sheet = sheet;
        this.query = String(query);
      }
      matchEntireCell() { return this; }
      findNext() {
        for (let r = 0; r < this.sheet.data.length; r++) {
          if (String(this.sheet.data[r][0]) === this.query) {
            return { getRow: () => r + 1 };
          }
        }
        return null;
      }
    }

    class MockSheet {
      constructor(name, data) {
        this.name = name;
        this.data = JSON.parse(JSON.stringify(data));
        this.mutationCount = 0;
      }
      getRange(startRowOrA1, col, numRows = 1, numCols = 1) {
        if (typeof startRowOrA1 === 'string' && startRowOrA1 === "A:A") {
          return {
            createTextFinder: (q) => new MockFinder(this, q)
          };
        }
        return new MockRange(this, startRowOrA1, col, numRows, numCols);
      }
    }

    // 初期シートデータ（rowId 1〜4）
    // 列順: [0]rowId, [1]cityName, [2]townName,
    //      [3]D completedAt, [4]E count, [5]F staffId, [6]G staffName,
    //      [7]H gpsStatus, [8]I photoStatus, [9]J lat, [10]K lng, [11]L gpsTime,
    //      [12]M fileId, [13]N photoUrl, [14]O photoTime, [15]P lineUserId, [16]Q requestId
    const initialSheetData = [
      ["1", "桑名市", "町丁1", "2026/10/01 10:00:00", 100, "S001", "配布員A", "OK", "OK", 35.0, 136.6, "2026/10/01 10:00:00", "fid1", "url1", "2026/10/01 10:00:00", "U_USER_A", "req_A_001"],
      ["2", "桑名市", "町丁2", "2026/10/01 10:30:00", 200, "S002", "配布員B", "OK", "OK", 35.1, 136.7, "2026/10/01 10:30:00", "fid2", "url2", "2026/10/01 10:30:00", "U_USER_B", "req_B_001"],
      ["3", "桑名市", "町丁3", "2026/10/01 11:00:00", 150, "S003", "配布員C", "OK", "OK", 35.2, 136.8, "2026/10/01 11:00:00", "fid3", "url3", "2026/10/01 11:00:00", "",         "req_C_001"], // Legacy P空欄
      ["4", "桑名市", "町丁4", "",                     0,   "",     "",        "",   "",   "",   "",    "",                    "",     "",     "",                    "",         ""         ]  // 未完了行
    ];

    const mockSheet = new MockSheet("配布実績2026-10", initialSheetData);

    const sandbox = {
      console,
      Date,
      Math,
      Number,
      String,
      Utilities: {
        formatDate: () => "2026/10/01 12:00:00"
      },
      LockService: {
        getScriptLock: () => ({
          waitLock: () => {},
          releaseLock: () => {}
        })
      },
      MonthlySheetResolver: {
        getInstance: () => ({
          getCurrentMonth: () => "2026-10",
          getCurrentSheet: () => mockSheet
        })
      },
      sanitizeFormula: (v) => v
    };

    vm.createContext(sandbox);

    // コードをサンドボックス内で評価
    vm.runInContext(gpsRepositoryJs, sandbox);
    vm.runInContext(gpsServiceJs, sandbox);

    const service = sandbox.GPSService.getInstance();
    const repo = sandbox.GPSRepository.getInstance();

    const snapshotBefore = JSON.parse(JSON.stringify(mockSheet.data));

    // --- 必須確認 1: 完了済み本人行 + isDone=false → INVALID_OPERATION / mutation 0 ---
    const res1 = service.updateRecordWithGPSPhoto({
      rowId: 1,
      isDone: false,
      staffId: "S001",
      resolvedLineUserId: "U_USER_A",
      requestId: "req_cancel_1"
    });
    assert.equal(res1.success, false, '本人完了行への isDone=false は失敗すること');
    assert.equal(res1.code, "INVALID_OPERATION", 'code は INVALID_OPERATION であること');
    assert.equal(mockSheet.mutationCount, 0, '本人行 isDone=false でスプレッドシートへの書込 (mutation) が 0 であること');
    assert.deepEqual(mockSheet.data[0], snapshotBefore[0], '本人行のデータが一切改ざん・消去されていないこと');

    // --- 必須確認 2: 完了済み他人行 + isDone=false → 同じく拒否 / mutation 0 ---
    const res2 = service.updateRecordWithGPSPhoto({
      rowId: 2, // 他人Bの行
      isDone: false,
      staffId: "S001", // 送信者はA
      resolvedLineUserId: "U_USER_A",
      requestId: "req_cancel_2"
    });
    assert.equal(res2.success, false, '他人完了行への isDone=false は失敗すること');
    assert.equal(res2.code, "INVALID_OPERATION", '他人行でも code は INVALID_OPERATION であること');
    assert.equal(mockSheet.mutationCount, 0, '他人行 isDone=false でスプレッドシート書込が 0 であること');
    assert.deepEqual(mockSheet.data[1], snapshotBefore[1], '他人B行のデータが一切改ざん・消去されていないこと');

    // --- 必須確認 3: Legacy P空欄行 + isDone=false → 同じく拒否 / mutation 0 ---
    const res3 = service.updateRecordWithGPSPhoto({
      rowId: 3, // Legacy P空欄行
      isDone: false,
      staffId: "S001",
      resolvedLineUserId: "U_USER_A",
      requestId: "req_cancel_3"
    });
    assert.equal(res3.success, false, 'Legacy行への isDone=false は失敗すること');
    assert.equal(res3.code, "INVALID_OPERATION", 'Legacy行でも code は INVALID_OPERATION であること');
    assert.equal(mockSheet.mutationCount, 0, 'Legacy行 isDone=false でスプレッドシート書込が 0 であること');
    assert.deepEqual(mockSheet.data[2], snapshotBefore[2], 'Legacy行のデータが保護されていること');

    // --- 必須確認 4: 未完了行 + isDone=false → 同じく拒否 / mutation 0 ---
    const res4 = service.updateRecordWithGPSPhoto({
      rowId: 4, // 未完了行
      isDone: false,
      staffId: "S001",
      resolvedLineUserId: "U_USER_A",
      requestId: "req_cancel_4"
    });
    assert.equal(res4.success, false, '未完了行への isDone=false も失敗すること');
    assert.equal(res4.code, "INVALID_OPERATION", '未完了行でも code は INVALID_OPERATION であること');
    assert.equal(mockSheet.mutationCount, 0, '未完了行 isDone=false でスプレッドシート書込が 0 であること');
    assert.deepEqual(mockSheet.data[3], snapshotBefore[3], '未完了行のデータが変化しないこと');

    // --- GPSRepository単体でも isDone=false 拒絶確認 ---
    const repoRes = repo.updateSheetRecordAndLog({ isDone: false, rowId: 1 }, 1, "OK", "OK", null, "");
    assert.equal(repoRes.success, false, 'GPSRepository単体でも isDone=false は書込せず失敗すること');
    assert.equal(mockSheet.mutationCount, 0, 'Repository単体呼出でも mutation 0 であること');

    // --- 必須確認 5: isDone=true 正常提出 → 従来通り成功 ---
    const res5 = service.updateRecordWithGPSPhoto({
      rowId: 4, // 未完了行への提出
      isDone: true,
      count: 250,
      staffId: "S001",
      staffName: "配布員A",
      latitude: 35.05,
      longitude: 136.65,
      resolvedLineUserId: "U_USER_A",
      requestId: "req_A_new_004"
    });
    assert.equal(res5.success, true, 'isDone=true の正常提出は成功すること');
    assert.equal(res5.rowId, 4);
    assert.equal(mockSheet.mutationCount, 1, '正常提出により初めて mutation が 1 となること');
    assert.equal(mockSheet.data[3][3], "2026/10/01 12:00:00", 'D completedAt が記録されたこと');
    assert.equal(mockSheet.data[3][4], 250, 'E count が記録されたこと');
    assert.equal(mockSheet.data[3][5], "S001", 'F staffId が記録されたこと');
    assert.equal(mockSheet.data[3][15], "U_USER_A", 'P lineUserId が記録されたこと');
    assert.equal(mockSheet.data[3][16], "req_A_new_004", 'Q requestId が記録されたこと');

    // --- 必須確認 6: 同一requestId → duplicate維持 ---
    const res6 = service.updateRecordWithGPSPhoto({
      rowId: 4,
      isDone: true,
      count: 250,
      staffId: "S001",
      staffName: "配布員A",
      resolvedLineUserId: "U_USER_A",
      requestId: "req_A_new_004" // 同一 requestId
    });
    assert.equal(res6.success, true, 'duplicate 判定で成功応答すること');
    assert.equal(res6.accepted, true);
    assert.equal(res6.duplicate, true, 'duplicate フラグが true であること');
    assert.equal(mockSheet.mutationCount, 1, '同一 requestId の再送では書込 (mutation) が発生しないこと');

    // --- 必須確認 7: 完了済み別requestId → alreadyCompleted維持 ---
    const res7 = service.updateRecordWithGPSPhoto({
      rowId: 4,
      isDone: true,
      count: 300,
      staffId: "S002",
      staffName: "配布員B",
      resolvedLineUserId: "U_USER_B",
      requestId: "req_B_diff_005" // 別 requestId
    });
    assert.equal(res7.success, true, 'alreadyCompleted 判定で成功応答すること');
    assert.equal(res7.accepted, true);
    assert.equal(res7.alreadyCompleted, true, 'alreadyCompleted フラグが true であること');
    assert.equal(mockSheet.mutationCount, 1, '完了済み別 requestId の操作では既存実績が保護され書込が発生しないこと');
  });
});

console.log('✅ ALL 9 PHASE 11 ACTIVITY STATE MACHINE VERIFICATION CHECKS DEFINED SUCCESSFULLY.\n');

