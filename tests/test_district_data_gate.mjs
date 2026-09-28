import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCSV, runDistrictDataValidation } from '../scripts/validate-district-data-gate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts/validate-district-data-gate.mjs');

console.log('====================================================');
console.log('🧪 TEST: DISTRICT DATA QUALITY GATE REGRESSION SUITE');
console.log('====================================================\n');

// ─────────────────────────────────────────────────────────────
// 1. CSV パーサー単体テスト（RFC 4180 正常系 & 構文異常系）
// ─────────────────────────────────────────────────────────────
console.log('▶ [1/4] Testing RFC 4180 CSV Parser...');

// 1.1 引用符内改行・カンマ・エスケープの正常パース
{
  const sampleCSV = [
    'col1,col2,col3',
    'val1,"line1\nline2",val3',
    '"val,with,comma","val with ""quotes""",simple'
  ].join('\r\n');

  const parsed = parseCSV(sampleCSV, 'test.csv');
  assert.equal(parsed.header.length, 3);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].col2, 'line1\nline2');
  assert.equal(parsed.rows[1].col1, 'val,with,comma');
  assert.equal(parsed.rows[1].col2, 'val with "quotes"');
  console.log('  ✅ 1.1 Quoted multiline, commas, and escaped quotes parsed correctly');
}

// 1.2 UTF-8 BOM 除去
{
  const bomCSV = '\uFEFFcolA,colB\n1,2';
  const parsed = parseCSV(bomCSV, 'bom.csv');
  assert.equal(parsed.header[0], 'colA');
  assert.equal(parsed.rows[0].colA, '1');
  console.log('  ✅ 1.2 UTF-8 BOM stripped transparently');
}

// 1.3 異常系: 未閉鎖の引用符
{
  const badQuote = 'col1,col2\nval1,"unclosed quote';
  assert.throws(
    () => parseCSV(badQuote, 'badQuote.csv'),
    /Unclosed quote detected/,
    'Must fail on unclosed quote'
  );
  console.log('  ✅ 1.3 Rejected unclosed quote');
}

// 1.4 異常系: 重複ヘッダー
{
  const dupHeader = 'col1,col2,col1\n1,2,3';
  assert.throws(
    () => parseCSV(dupHeader, 'dupHeader.csv'),
    /Duplicate column header detected/,
    'Must fail on duplicate column header'
  );
  console.log('  ✅ 1.4 Rejected duplicate column header');
}

// 1.5 異常系: 列数不一致
{
  const colMismatch = 'col1,col2,col3\n1,2';
  assert.throws(
    () => parseCSV(colMismatch, 'colMismatch.csv'),
    /column count mismatch/,
    'Must fail on column count mismatch'
  );
  console.log('  ✅ 1.5 Rejected row column count mismatch');
}

// ─────────────────────────────────────────────────────────────
// 2. 現行本番データに対する検証（正常系）
// ─────────────────────────────────────────────────────────────
console.log('\n▶ [2/4] Testing Current Active District Data (Pass Case)...');
{
  const currentDataDir = path.join(REPO_ROOT, 'data');
  const report = runDistrictDataValidation(currentDataDir);
  assert.equal(report.pass, true, `Current data must pass: ${JSON.stringify(report.errors)}`);
  assert.equal(report.errors.length, 0);
  assert.ok(report.details.count.addressMaster > 0);
  assert.equal(report.details.count.addressMaster, report.details.count.boundaries);
  assert.equal(report.details.count.addressMaster, report.details.count.municipalityExpected);
  console.log(`  ✅ 2.1 Current data passed: ${report.details.count.addressMaster} items matched across Triad`);
}

// ─────────────────────────────────────────────────────────────
// 3. 合成フィクスチャによる各種異常系拒絶テスト
// ─────────────────────────────────────────────────────────────
console.log('\n▶ [3/4] Testing Negative Cases with Synthetic Fixtures...');

function createSyntheticFixture(overrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'district-gate-test-'));

  const addressCsv = overrides.addressCsv ?? [
    'rowId,city_name,town_name,latitude,longitude,households,population,e_stat_code',
    '1,City-A,Town-1,35.0,136.0,10,20,1001',
    '2,City-A,Town-2,35.1,136.1,15,30,1002',
    '3,City-B,Town-3,35.2,136.2,20,40,1003'
  ].join('\n');

  const muniCsv = overrides.muniCsv ?? [
    'city_name,city_code,total_towns',
    'City-A,99001,2',
    'City-B,99002,1'
  ].join('\n');

  const boundariesGeo = overrides.boundariesGeo ?? JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[136.0, 35.0], [136.1, 35.0], [136.1, 35.1], [136.0, 35.0]]] },
        properties: { rowId: 1, city_name: 'City-A', town_name: 'Town-1' }
      },
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[136.1, 35.1], [136.2, 35.1], [136.2, 35.2], [136.1, 35.1]]] },
        properties: { rowId: 2, city_name: 'City-A', town_name: 'Town-2' }
      },
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[136.2, 35.2], [136.3, 35.2], [136.3, 35.3], [136.2, 35.2]]] },
        properties: { rowId: 3, city_name: 'City-B', town_name: 'Town-3' }
      }
    ]
  });

  const electionJson = overrides.electionJson ?? JSON.stringify({
    elections: [
      {
        electionId: 'E-01',
        municipalities: {
          'City-A': 50.0,
          'City-B': 60.0
        }
      }
    ]
  });

  const areaMappingJson = overrides.areaMappingJson ?? JSON.stringify([]);
  const storageLocationsJson = overrides.storageLocationsJson ?? JSON.stringify(['City-A', 'City-B', 'Neighbor-C']);

  if (overrides.skipAddress !== true) fs.writeFileSync(path.join(tmpDir, 'address_master.csv'), addressCsv, 'utf8');
  if (overrides.skipMuni !== true) fs.writeFileSync(path.join(tmpDir, 'municipality_master.csv'), muniCsv, 'utf8');
  if (overrides.skipBounds !== true) fs.writeFileSync(path.join(tmpDir, 'boundaries.geojson'), boundariesGeo, 'utf8');
  if (overrides.skipElection !== true) fs.writeFileSync(path.join(tmpDir, 'election_history.json'), electionJson, 'utf8');
  if (overrides.skipAreaMapping !== true) fs.writeFileSync(path.join(tmpDir, 'area_mapping.json'), areaMappingJson, 'utf8');
  if (overrides.skipStorage !== true) fs.writeFileSync(path.join(tmpDir, 'storage_locations.json'), storageLocationsJson, 'utf8');

  return tmpDir;
}

// 3.1 ファイル欠落検知
{
  const dir = createSyntheticFixture({ skipBounds: true });
  const rep = runDistrictDataValidation(dir);
  assert.equal(rep.pass, false);
  assert.ok(rep.errors.some(e => e.includes('Required master file missing: boundaries.geojson')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 3.1 Missing file detected and rejected');
}

// 3.2 必須ヘッダー欠落検知 (latitude 欠落)
{
  const badAddr = 'rowId,city_name,town_name,longitude\n1,City-A,Town-1,136.0';
  const dir = createSyntheticFixture({ addressCsv: badAddr });
  const rep = runDistrictDataValidation(dir);
  assert.equal(rep.pass, false);
  assert.ok(rep.errors.some(e => e.includes('missing required header: latitude')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 3.2 Missing required header (latitude) rejected');
}

// 3.3 座標形式異常検知 (NaN / 範囲外)
{
  const badCoord = [
    'rowId,city_name,town_name,latitude,longitude',
    '1,City-A,Town-1,INVALID_LAT,136.0'
  ].join('\n');
  const dir = createSyntheticFixture({ addressCsv: badCoord });
  const rep = runDistrictDataValidation(dir);
  assert.equal(rep.pass, false);
  assert.ok(rep.errors.some(e => e.includes('invalid latitude')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 3.3 Invalid coordinate format rejected');
}

// 3.4 全体件数 N 不一致検知 (Rule-01)
{
  const shortAddr = [
    'rowId,city_name,town_name,latitude,longitude',
    '1,City-A,Town-1,35.0,136.0',
    '2,City-A,Town-2,35.1,136.1'
    // 3番が欠落して 2件
  ].join('\n');
  const dir = createSyntheticFixture({ addressCsv: shortAddr });
  const rep = runDistrictDataValidation(dir);
  assert.equal(rep.pass, false);
  assert.ok(rep.errors.some(e => e.includes('Rule-01 Total count mismatch')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 3.4 Total count mismatch rejected');
}

// 3.5 自治体別件数内訳不一致検知 (全体 N=3 は一致だが内訳が狂っているケース)
{
  // expected: City-A=2, City-B=1
  // actual in address: City-A=1, City-B=2 (N=3 で合計は同じ)
  const skewedAddr = [
    'rowId,city_name,town_name,latitude,longitude',
    '1,City-A,Town-1,35.0,136.0',
    '2,City-B,Town-2,35.1,136.1',
    '3,City-B,Town-3,35.2,136.2'
  ].join('\n');
  const dir = createSyntheticFixture({ addressCsv: skewedAddr });
  const rep = runDistrictDataValidation(dir);
  assert.equal(rep.pass, false);
  assert.ok(rep.errors.some(e => e.includes('Municipality town count mismatch')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 3.5 Per-municipality subtotal count mismatch rejected');
}

// 3.6 rowId 欠番検知 (Rule-02)
{
  const gapAddr = [
    'rowId,city_name,town_name,latitude,longitude',
    '1,City-A,Town-1,35.0,136.0',
    '2,City-A,Town-2,35.1,136.1',
    '4,City-B,Town-3,35.2,136.2' // 3 が欠番で 4
  ].join('\n');
  const dir = createSyntheticFixture({ addressCsv: gapAddr });
  const rep = runDistrictDataValidation(dir);
  assert.equal(rep.pass, false);
  assert.ok(rep.errors.some(e => e.includes('Rule-02 Sequence gap')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 3.6 rowId sequence gap rejected');
}

// 3.7 定義外自治体名の混入検知
{
  const unknownCityAddr = [
    'rowId,city_name,town_name,latitude,longitude',
    '1,City-A,Town-1,35.0,136.0',
    '2,City-A,Town-2,35.1,136.1',
    '3,Unknown-City-X,Town-3,35.2,136.2' // 未知の自治体
  ].join('\n');
  const dir = createSyntheticFixture({ addressCsv: unknownCityAddr });
  const rep = runDistrictDataValidation(dir);
  assert.equal(rep.pass, false);
  assert.ok(rep.errors.some(e => e.includes('undefined city_name "Unknown-City-X"')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 3.7 Undefined city_name rejected');
}

// 3.8 選挙履歴キー不一致検知 (欠落 & 余剰)
{
  // 欠落: City-B がない
  const missingEl = JSON.stringify({
    elections: [{ electionId: 'E-01', municipalities: { 'City-A': 50.0 } }]
  });
  const dir1 = createSyntheticFixture({ electionJson: missingEl });
  const rep1 = runDistrictDataValidation(dir1);
  assert.equal(rep1.pass, false);
  assert.ok(rep1.errors.some(e => e.includes('missing expected municipality "City-B"')));
  fs.rmSync(dir1, { recursive: true, force: true });

  // 余剰: 未知の City-Z がある
  const extraEl = JSON.stringify({
    elections: [{ electionId: 'E-01', municipalities: { 'City-A': 50.0, 'City-B': 60.0, 'City-Z': 70.0 } }]
  });
  const dir2 = createSyntheticFixture({ electionJson: extraEl });
  const rep2 = runDistrictDataValidation(dir2);
  assert.equal(rep2.pass, false);
  assert.ok(rep2.errors.some(e => e.includes('undefined municipality key "City-Z"')));
  fs.rmSync(dir2, { recursive: true, force: true });
  console.log('  ✅ 3.8 Election history municipality key mismatch rejected (both missing and extra)');
}

// 3.9 補助 JSON 形式不正検知 (area_mapping.json が配列でない)
{
  const notArray = JSON.stringify({ key: 'not an array' });
  const dir = createSyntheticFixture({ areaMappingJson: notArray });
  const rep = runDistrictDataValidation(dir);
  assert.equal(rep.pass, false);
  assert.ok(rep.errors.some(e => e.includes('area_mapping.json must be an array')));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('  ✅ 3.9 Auxiliary JSON non-array format rejected');
}

// ─────────────────────────────────────────────────────────────
// 4. CLI 実行によるプロセス終了コード検証 (Fail-Closed)
// ─────────────────────────────────────────────────────────────
console.log('\n▶ [4/4] Testing CLI Process Exit Code (Fail-Closed Execution)...');
{
  // 4.1 引数なし CLI: デフォルト data/ ディレクトリの検証成功 (exit 0)
  try {
    const stdout = execSync(`node ${SCRIPT_PATH}`, { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(stdout.includes('ALL CHECKS PASSED PERFECTLY'));
    console.log('  ✅ 4.1 CLI default execution exited with code 0 (PASS)');
  } catch (err) {
    assert.fail(`CLI execution on default data must exit with code 0: ${err.message}`);
  }

  // 4.2 --data-dir による異常系ディレクトリ指定: exit code 1 で停止
  const badDir = createSyntheticFixture({ skipBounds: true });
  try {
    execSync(`node ${SCRIPT_PATH} --data-dir "${badDir}"`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' });
    assert.fail('CLI must fail on bad directory');
  } catch (err) {
    assert.equal(err.status, 1, 'Process exit code must be 1 on failure');
    assert.ok(err.stderr.includes('[Hard Stop]') || err.stdout.includes('[Hard Stop]'));
    console.log('  ✅ 4.2 CLI with --data-dir on invalid fixture exited with code 1 (Fail-Closed verified)');
  } finally {
    fs.rmSync(badDir, { recursive: true, force: true });
  }
}

console.log('\n====================================================');
console.log('🎉 ALL DISTRICT DATA QUALITY GATE TESTS PASSED (100%)');
console.log('====================================================\n');
