/**
 * test_staff_id_info_lifecycle.mjs
 * Hアプリ StaffIdInfoView (ID情報モーダル) ライフサイクル検証テストスイート (Wave 8)
 * 
 * 検証原則:
 * 1. ID_INFO_DATA の完全一致検証 (HEAD app.js との完全ディープイコール照合)
 * 2. Terms / Privacy / License の 3 種表示・HTML構造・アニメーションクラス制御
 * 3. License 地区名動的置換 & escapeHtml 必須適用 (生文字列フォールバックなし)
 * 4. モーダル開閉アニメーション (translate-y-full, opacity-0, pointer-events-none)
 * 5. イベント伝播抑止 (event.stopPropagation)
 * 6. 不明種別・モーダル不在時の安全性 (Fail-Safe 早期リターン)
 * 7. 表示側 (StaffIdInfoView) のストレージ非依存性 (localStorage 直接参照ゼロ)
 * 8. app.js 地区名解決タイミング (License時のみ読取り、Terms/Privacyでは0回)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('🧪 H-APP STAFF ID INFO VIEW LIFECYCLE AUDIT (Wave 8)');
console.log('====================================================\n');

// 簡易 DOM モック環境構築
function createMockDOM() {
  const elements = {};

  function createElement(id, tagName = 'div', classes = []) {
    const classSet = new Set(classes);
    const el = {
      id,
      tagName,
      textContent: '',
      innerHTML: '',
      classList: {
        add: (...cls) => cls.forEach(c => classSet.add(c)),
        remove: (...cls) => cls.forEach(c => classSet.delete(c)),
        contains: (c) => classSet.has(c),
        get length() { return classSet.size; }
      },
      children: [],
      get firstElementChild() {
        return el.children[0] || null;
      }
    };
    elements[id] = el;
    return el;
  }

  // 構造: id-info-modal -> firstElementChild (カードDOM) -> titleEl, bodyEl
  const modal = createElement('id-info-modal', 'div', ['opacity-0', 'pointer-events-none']);
  const card = createElement('id-info-card', 'div', ['translate-y-full']);
  modal.children.push(card);

  const titleEl = createElement('id-info-title', 'h4');
  const bodyEl = createElement('id-info-body', 'p');

  elements['id-info-modal'] = modal;
  elements['id-info-title'] = titleEl;
  elements['id-info-body'] = bodyEl;

  return {
    document: {
      getElementById: (id) => elements[id] || null
    },
    elements
  };
}

// StaffIdInfoView ロード関数
function loadStaffIdInfoView(mockDOM) {
  const staffJsPath = path.join(rootDir, 'active/h-app/components/staff.js');
  const code = fs.readFileSync(staffJsPath, 'utf8');

  // escapeHtml のモック（XSSエスケープ用）
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const contextWindow = {
    document: mockDOM.document,
    escapeHtml
  };

  const fn = new Function('window', 'document', 'escapeHtml', `${code}; return window.StaffIdInfoView;`);
  const View = fn(contextWindow, mockDOM.document, escapeHtml);
  return { View, escapeHtml };
}

test('Gate 1: ID_INFO_DATA の完全一致検証 (HEAD app.js との完全ディープイコール照合)', () => {
  // Git HEAD (直前コミット) の app.js から ID_INFO_DATA を抽出
  const headAppJs = execSync('git show HEAD~1:active/h-app/app.js', { cwd: rootDir, encoding: 'utf8' });
  const match = headAppJs.match(/const ID_INFO_DATA = (\{[\s\S]*?\n\};)/);
  assert.ok(match, 'HEAD~1 app.js に ID_INFO_DATA が存在すること');

  const evalHeadData = new Function(`return ${match[1]}`)();

  // 現在の StaffIdInfoView の内部データ
  const mockDOM = createMockDOM();
  const { View } = loadStaffIdInfoView(mockDOM);
  const currentData = View.getRawData();

  assert.deepStrictEqual(currentData, evalHeadData, 'StaffIdInfoView の ID_INFO_DATA は移動前 app.js と完全一致すること (文言・HTML・構造の完全同一性)');
});

test('Gate 2: Terms 表示 & HTML構造 & アニメーションクラス解除', () => {
  const mockDOM = createMockDOM();
  const { View } = loadStaffIdInfoView(mockDOM);
  const modal = mockDOM.elements['id-info-modal'];
  const card = modal.firstElementChild;
  const titleEl = mockDOM.elements['id-info-title'];
  const bodyEl = mockDOM.elements['id-info-body'];

  View.open('terms');

  assert.strictEqual(titleEl.textContent, 'Terms of Service');
  assert.strictEqual(bodyEl.innerHTML, View.getRawData('terms').body);
  assert.strictEqual(modal.classList.contains('pointer-events-none'), false, 'pointer-events-none が解除されていること');
  assert.strictEqual(modal.classList.contains('opacity-0'), false, 'opacity-0 が解除されていること');
  assert.strictEqual(card.classList.contains('translate-y-full'), false, 'translate-y-full が解除されていること');
});

test('Gate 3: Privacy 表示 & HTML構造', () => {
  const mockDOM = createMockDOM();
  const { View } = loadStaffIdInfoView(mockDOM);
  const titleEl = mockDOM.elements['id-info-title'];
  const bodyEl = mockDOM.elements['id-info-body'];

  View.open('privacy');

  assert.strictEqual(titleEl.textContent, 'Privacy Policy');
  assert.strictEqual(bodyEl.innerHTML, View.getRawData('privacy').body);
});

test('Gate 4: License 表示 & 地区名動的置換 (正常系)', () => {
  const mockDOM = createMockDOM();
  const { View } = loadStaffIdInfoView(mockDOM);
  const titleEl = mockDOM.elements['id-info-title'];
  const bodyEl = mockDOM.elements['id-info-body'];

  View.open('license', { branchName: '桑名地区' });

  assert.strictEqual(titleEl.textContent, 'License');
  assert.ok(bodyEl.innerHTML.includes('【桑名地区】'), '地区名が【桑名地区】に置換されていること');
  assert.ok(!bodyEl.innerHTML.includes('__BRANCH_NAME__'), '__BRANCH_NAME__ プレースホルダが残っていないこと');
});

test('Gate 5: 地区名エスケープ (生文字列フォールバックなし・XSS防止)', () => {
  const mockDOM = createMockDOM();
  const { View } = loadStaffIdInfoView(mockDOM);
  const bodyEl = mockDOM.elements['id-info-body'];

  // 悪意のあるタグを含む地区名
  const maliciousBranch = '<script>alert("xss")</script>';
  View.open('license', { branchName: maliciousBranch });

  assert.ok(bodyEl.innerHTML.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'HTMLタグがエスケープされていること');
  assert.ok(!bodyEl.innerHTML.includes('<script>'), '生のscriptタグが注入されていないこと');
});

test('Gate 6: モーダル開閉 (アニメーションクラスの着脱)', () => {
  const mockDOM = createMockDOM();
  const { View } = loadStaffIdInfoView(mockDOM);
  const modal = mockDOM.elements['id-info-modal'];
  const card = modal.firstElementChild;

  // Open
  View.open('terms');
  assert.strictEqual(modal.classList.contains('opacity-0'), false);
  assert.strictEqual(modal.classList.contains('pointer-events-none'), false);
  assert.strictEqual(card.classList.contains('translate-y-full'), false);

  // Close
  View.close();
  assert.strictEqual(modal.classList.contains('opacity-0'), true, 'close時に opacity-0 が再付与されること');
  assert.strictEqual(modal.classList.contains('pointer-events-none'), true, 'close時に pointer-events-none が再付与されること');
  assert.strictEqual(card.classList.contains('translate-y-full'), true, 'close時に translate-y-full が再付与されること');
});

test('Gate 7: イベント伝播抑止 (event.stopPropagation)', () => {
  const mockDOM = createMockDOM();
  const { View } = loadStaffIdInfoView(mockDOM);

  let stopped = false;
  const mockEvent = {
    stopPropagation: () => {
      stopped = true;
    }
  };

  View.open('terms', { event: mockEvent });
  assert.strictEqual(stopped, true, 'event.stopPropagation が確実に実行されていること');
});

test('Gate 8: 不明種別・モーダル不在時の安全性 (Fail-Safe 早期リターン)', () => {
  const mockDOM = createMockDOM();
  const { View } = loadStaffIdInfoView(mockDOM);

  // 不明種別
  assert.doesNotThrow(() => {
    View.open('unknown_type');
  }, '不明な種別が渡されても例外をスローしないこと');

  // モーダル不在環境
  const emptyDOM = { document: { getElementById: () => null } };
  const { View: emptyView } = loadStaffIdInfoView(emptyDOM);
  assert.doesNotThrow(() => {
    emptyView.open('terms');
    emptyView.close();
  }, 'モーダル要素が存在しない場合も例外をスローせず早期リターンすること');
});

test('Gate 9: 表示側 (components/staff.js) のストレージ非依存静的検査', () => {
  const staffJsPath = path.join(rootDir, 'active/h-app/components/staff.js');
  const code = fs.readFileSync(staffJsPath, 'utf8');

  assert.ok(!code.includes('localStorage'), 'components/staff.js 内に localStorage 参照が存在しないこと');
  assert.ok(!code.includes('sessionStorage'), 'components/staff.js 内に sessionStorage 参照が存在しないこと');
});

test('Gate 10: app.js 地区名解決タイミング (License時のみ実行・優先順位維持)', () => {
  const appJsPath = path.join(rootDir, 'active/h-app/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // openIdInfoModal の関数定義を抽出
  const match = appJs.match(/function openIdInfoModal\(type,\s*event\)[\s\S]*?^\}/m);
  assert.ok(match, 'app.js に openIdInfoModal が存在すること');
  const funcCode = match[0];

  assert.ok(funcCode.includes("if (type === 'license')"), 'License時のみ地区名解決が行われること');
  assert.ok(funcCode.includes("window.__districtName || localStorage.getItem('branch_name') || ''"), '優先順位 (window.__districtName -> localStorage) が維持されていること');
  assert.ok(funcCode.includes("StaffIdInfoView.open"), 'StaffIdInfoView.open へ委譲されていること');
  assert.ok(!funcCode.includes("ID_INFO_DATA"), 'app.js 内に ID_INFO_DATA が存在しないこと');
});

console.log('✅ ALL 10 STAFF ID INFO VIEW GATES DEFINED SUCCESSFULLY.\n');
