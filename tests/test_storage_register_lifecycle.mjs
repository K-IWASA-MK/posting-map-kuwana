/**
 * test_storage_register_lifecycle.mjs
 * 在庫登録画面 (page-storage-register) のライフサイクル & ユーザー入力保護 監査テスト
 * 
 * Gate 1: 初回取得（キャッシュなし時、API取得後に正常反映）
 * Gate 2: キャッシュ即時復元（キャッシュあり時、即座に同期反映、API待ちゼロ）
 * Gate 3: In-flight重複防止（高速画面往復で getFlyerStock が重複発射されずPromise共有）
 * Gate 4: ユーザー入力保護【最重要】（API通信中に「500」入力 → レスポンス到着後も500を維持）
 * Gate 5: 保管場所選択保護（手動選択中にAPIレスポンスが到着しても選択値を維持）
 * Gate 6: 登録完了後のキャッシュ即時更新（_stockFetched=true維持、次回一覧即時表示）
 */

import assert from 'node:assert/strict';

console.log('====================================================');
console.log('🧪 STORAGE REGISTER LIFECYCLE & INPUT PROTECTION AUDIT');
console.log('====================================================\n');

// 仮想 DOM & LocalStorage 環境のモック
class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.classList = new Set(['hidden']);
    this.style = {};
    this.dataset = {};
    this._listeners = {};
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  dispatchEvent(event) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(fn => fn.call(this));
    }
  }
}

const elements = {};
function $(id) {
  if (!elements[id]) {
    const tag = id.includes('input') || id.includes('count') ? 'input' :
                id.includes('select') || id.includes('location') ? 'select' : 'div';
    elements[id] = new MockElement(id, tag);
  }
  return elements[id];
}

const localStorageStore = {
  'user_info': JSON.stringify({ id: 'STAFF_007', first: '太郎', last: '桑名' })
};

const localStorage = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); }
};

let activeElement = null;
const document = {
  get activeElement() { return activeElement; },
  getElementById: (id) => $(id),
  querySelectorAll: () => []
};

// 被テスト変数の初期化
let _stockData = [];
let _stockFetched = false;
let _activeFlyerStockPromise = null;
let _flyerStockReqSeq = 0;
let apiCallCount = 0;
let mockApiResponseData = null;
let mockApiDelayMs = 20;

async function callApiPost(action, payload = {}) {
  if (action === 'getFlyerStock') {
    apiCallCount++;
    await new Promise(r => setTimeout(r, mockApiDelayMs));
    return mockApiResponseData;
  }
  if (action === 'updateFlyerStock') {
    apiCallCount++;
    await new Promise(r => setTimeout(r, mockApiDelayMs));
    return { success: true };
  }
  return { success: true };
}

// UIヘルパーモック
function updateStorageCountDisplay() {
  const countInput = $('storage-register-count');
  const countText = $('storage-register-count-text');
  if (countInput && countText) countText.textContent = countInput.value;
}
function updateStorageRegisterButtonText() {}
function updateStorageLocationDisplayText() {
  const locSelect = $('storage-register-location');
  const locText = $('storage-location-text');
  if (locSelect && locText) locText.textContent = locSelect.value;
}
function updateStorageLocationDropdown() {}
function getStorageLocations() { return Promise.resolve(['桑名市', '四日市市']); }
let _storageLocationsCache = ['桑名市', '四日市市'];

function setupStorageRegisterInputFormatter(inputEl) {
  if (!inputEl || inputEl.dataset.formatted) return;
  inputEl.dataset.formatted = 'true';

  inputEl.addEventListener('click', function() {
    inputEl.classList.delete('hidden');
    inputEl.dataset.userEditing = 'true';
    activeElement = inputEl;
  });
  inputEl.addEventListener('focus', function() {
    inputEl.classList.delete('hidden');
    inputEl.dataset.userEditing = 'true';
    activeElement = inputEl;
  });
  inputEl.addEventListener('input', function() {
    inputEl.dataset.userEditing = 'true';
  });
  inputEl.addEventListener('blur', function() {
    inputEl.classList.add('hidden');
    activeElement = null;
  });
}

// 評価対象の関数群 (app.js のロジックと100%同一)
async function fetchFlyerStock(options = {}) {
  if (_activeFlyerStockPromise) {
    return _activeFlyerStockPromise;
  }

  const currentSeq = ++_flyerStockReqSeq;

  _activeFlyerStockPromise = (async () => {
    try {
      const data = await callApiPost('getFlyerStock');
      if (currentSeq !== _flyerStockReqSeq) {
        return null;
      }
      if (data && data.success && Array.isArray(data.stocks)) {
        _stockData = data.stocks;
        _stockFetched = true;
      }
      return data;
    } catch (err) {
      console.warn('[fetchFlyerStock] Error:', err);
      throw err;
    } finally {
      _activeFlyerStockPromise = null;
    }
  })();

  return _activeFlyerStockPromise;
}

function applyMyStockToForm(options = {}) {
  const { isAsyncResponse = false } = options;
  const countInput = $('storage-register-count');
  const locSelect = $('storage-register-location');
  if (!countInput) return;

  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffId = userInfo.id || '';
  if (!staffId || !Array.isArray(_stockData) || _stockData.length === 0) return;

  const myStock = _stockData.find(s => String(s.staffId) === String(staffId));
  if (!myStock) return;

  const isInputActive = document.activeElement === countInput ||
                        !countInput.classList.has('hidden') ||
                        countInput.dataset.userEditing === 'true';

  if (!isAsyncResponse || !isInputActive) {
    const rawCount = parseInt(myStock.count, 10);
    countInput.value = isNaN(rawCount) ? '' : String(rawCount);
    if (!isAsyncResponse) {
      delete countInput.dataset.userEditing;
    }
    updateStorageCountDisplay();
    updateStorageRegisterButtonText();
  }

  const isLocActive = document.activeElement === locSelect || (locSelect && locSelect.dataset.userSelected === 'true');
  if (locSelect && myStock.location && (!isAsyncResponse || !isLocActive)) {
    locSelect.value = myStock.location;
    updateStorageLocationDisplayText();
  }
}

function initStorageRegisterPage() {
  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffId = userInfo.id || '';
  const countInput = $('storage-register-count');
  setupStorageRegisterInputFormatter(countInput);

  const locSelect = $('storage-register-location');
  if (locSelect && !locSelect.dataset.changeBound) {
    locSelect.dataset.changeBound = 'true';
    locSelect.addEventListener('change', function() {
      this.dataset.userSelected = 'true';
      updateStorageLocationDisplayText();
    });
  }

  // 1. 既存キャッシュからの即時同期反映
  if (_stockFetched && Array.isArray(_stockData) && _stockData.length > 0) {
    applyMyStockToForm({ isAsyncResponse: false });
  }

  // 2. API取得 (In-flight共有付き)
  if (staffId && countInput) {
    fetchFlyerStock().then(data => {
      if (data && data.success && Array.isArray(data.stocks)) {
        applyMyStockToForm({ isAsyncResponse: true });
      }
    }).catch(() => {});
  }

  updateStorageCountDisplay();
  updateStorageRegisterButtonText();
}

async function submitFlyerStock(location, count) {
  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffId = userInfo.id || '';
  const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
  const countInput = $('storage-register-count');
  const locSelect = $('storage-register-location');

  const res = await callApiPost('updateFlyerStock', {
    location, count, staffName, staffId
  });

  if (res && res.success) {
    if (!Array.isArray(_stockData)) _stockData = [];
    const idx = _stockData.findIndex(s => String(s.staffId) === String(staffId));
    if (idx >= 0) {
      _stockData[idx] = { ..._stockData[idx], location: location, count: count, staffName: staffName };
    } else {
      _stockData.push({ staffId: staffId, staffName: staffName, location: location, count: count });
    }
    _stockFetched = true;

    if (countInput) delete countInput.dataset.userEditing;
    if (locSelect) delete locSelect.dataset.userSelected;

    fetchFlyerStock({ force: true }).catch(() => {});
  }
}

// --------------------------------------------------------------------------
// TEST EXECUTION
// --------------------------------------------------------------------------

async function runTests() {
  // Gate 1: 初回取得（キャッシュなし時）
  console.log('--- Gate 1: 初回取得（キャッシュなし時、API取得後に正常反映） ---');
  _stockData = [];
  _stockFetched = false;
  apiCallCount = 0;
  mockApiResponseData = {
    success: true,
    stocks: [{ staffId: 'STAFF_007', staffName: '桑名 太郎', location: '桑名市', count: 1200 }]
  };

  initStorageRegisterPage();
  assert.equal($('storage-register-count').value, '', 'API完了前は空');
  assert.equal(apiCallCount, 1, '初回のAPI呼び出しが発射された');

  // API完了を待機
  await new Promise(r => setTimeout(r, mockApiDelayMs + 10));
  assert.equal($('storage-register-count').value, '1200', 'API完了後に1200が反映された');
  assert.equal($('storage-register-location').value, '桑名市', '保管場所が反映された');
  assert.equal(_stockFetched, true, '_stockFetchedがtrueに設定された');
  console.log('✅ Gate 1 PASS\n');

  // Gate 2: キャッシュ即時復元（API完了を待たない）
  console.log('--- Gate 2: キャッシュ即時復元（API待ちゼロ） ---');
  $('storage-register-count').value = '';
  $('storage-register-location').value = '';
  delete $('storage-register-count').dataset.userEditing;

  initStorageRegisterPage();
  assert.equal($('storage-register-count').value, '1200', 'API待ちゼロで即座に1200が反映された');
  assert.equal($('storage-register-location').value, '桑名市', 'API待ちゼロで即座に桑名市が反映された');
  await new Promise(r => setTimeout(r, mockApiDelayMs + 10));
  console.log('✅ Gate 2 PASS\n');

  // Gate 3: In-flight重複防止（高速画面往復）
  console.log('--- Gate 3: In-flight重複防止（高速画面往復） ---');
  apiCallCount = 0;
  mockApiDelayMs = 50;

  initStorageRegisterPage();
  assert.equal(apiCallCount, 1, '1回目のAPI発射');

  initStorageRegisterPage();
  assert.equal(apiCallCount, 1, '2回目オープン時、進行中Promise共有のためAPIは重複発射されない');

  initStorageRegisterPage();
  assert.equal(apiCallCount, 1, '3回目オープン時もAPIは重複発射されない');

  await new Promise(r => setTimeout(r, 60));
  assert.equal(_activeFlyerStockPromise, null, 'API完了後にPromiseがnullにクリアされる');
  console.log('✅ Gate 3 PASS\n');

  // Gate 4: ユーザー入力保護【最重要】
  console.log('--- Gate 4: ユーザー入力保護【最重要】（API通信中に「500」入力 → レスポンス到着後も500維持） ---');
  mockApiDelayMs = 40;
  mockApiResponseData = {
    success: true,
    stocks: [{ staffId: 'STAFF_007', staffName: '桑名 太郎', location: '桑名市', count: 1200 }]
  };

  initStorageRegisterPage();
  assert.equal($('storage-register-count').value, '1200', 'キャッシュから1200が即座に入力');

  // ★ API通信中にユーザーが「500」と手入力するシナリオ
  const inputEl = $('storage-register-count');
  inputEl.dispatchEvent('click');
  inputEl.value = '500';
  inputEl.dispatchEvent('input');

  assert.equal(inputEl.value, '500', 'ユーザーが500を入力');
  assert.equal(inputEl.dataset.userEditing, 'true', 'userEditingフラグがセットされている');

  // ★ この状態で遅延していた API レスポンスが到着
  await new Promise(r => setTimeout(r, 50));

  // ★ 検証: APIレスポンス (1200) で上書きされず、ユーザー入力「500」が保持されていること！
  assert.equal(inputEl.value, '500', '遅延APIレスポンス到着後もユーザー入力 500 が100%保持されている');
  console.log('✅ Gate 4 PASS (ユーザー入力値 500 が完全保護された)\n');

  // Gate 5: 保管場所選択保護
  console.log('--- Gate 5: 保管場所選択保護（手動変更中にAPIレスポンス到着） ---');
  mockApiDelayMs = 40;
  mockApiResponseData = {
    success: true,
    stocks: [{ staffId: 'STAFF_007', staffName: '桑名 太郎', location: '桑名市', count: 1200 }]
  };

  initStorageRegisterPage();
  const locSelect = $('storage-register-location');
  locSelect.value = '四日市市';
  locSelect.dispatchEvent('change');
  assert.equal(locSelect.dataset.userSelected, 'true');

  await new Promise(r => setTimeout(r, 50));
  assert.equal(locSelect.value, '四日市市', '遅延API到着後もユーザーが選択した「四日市市」が保持されている');
  console.log('✅ Gate 5 PASS (保管場所選択値が完全保護された)\n');

  // Gate 6: 在庫登録成功後のキャッシュ即時更新
  console.log('--- Gate 6: 在庫登録成功後のキャッシュ即時更新（_stockFetched=true維持） ---');
  mockApiDelayMs = 10;
  await submitFlyerStock('四日市市', 500);

  assert.equal(_stockFetched, true, '登録後も _stockFetched=true が維持されている');
  const myStock = _stockData.find(s => s.staffId === 'STAFF_007');
  assert.equal(myStock.count, 500, 'キャッシュ上の枚数が500に更新された');
  assert.equal(myStock.location, '四日市市', 'キャッシュ上の場所が四日市市に更新された');

  delete $('storage-register-count').dataset.userEditing;
  initStorageRegisterPage();
  assert.equal($('storage-register-count').value, '500', '次回遷移時に即座に500が表示される');
  console.log('✅ Gate 6 PASS\n');

  console.log('====================================================');
  console.log('🎉 ALL 6 GATES PASSED PERFECTLY!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
