function getApiUrl() {
  if (typeof window !== 'undefined' && window.PMS_CLIENT_CONFIG && window.PMS_CLIENT_CONFIG.api && window.PMS_CLIENT_CONFIG.api.gasWebAppUrl) {
    return window.PMS_CLIENT_CONFIG.api.gasWebAppUrl;
  }
  throw new Error('[H-App Config Error] PMS_CLIENT_CONFIG.api.gasWebAppUrl が未設定です。config.js を確認してください。');
}
const API_URL = getApiUrl();

function getLiffAuthToken() {
  if (typeof liff === "undefined") {
    return null;
  }
  try {
    if (!liff.isLoggedIn()) {
      return null;
    }
    return liff.getAccessToken();
  } catch (e) {
    return null;
  }
}

const PUBLIC_ACTIONS = [
  'getMapsApiKey',
  'getTier1',
  'registerOrValidateDevice',
  'getDeviceStatus',
  'verifyManagerPassword'
];

const IDENTITY_BOOTSTRAP_ACTIONS = [
  'getStaffIdentity',
  'registerStaff'
];

const PROTECTED_WRITE_ACTIONS = [
  'updateRecordWithGPSPhoto',
  'submitDistribution',
  'updateFlyerStock',
  'requestFlyerTransfer',
  'createBulletinPost',
  'sendBulletinContact',
  'setPinInProgress',
  'resolveTransferRequest'
];

const TRANSIENT_ERROR_CODES = [
  'NETWORK_FAILURE',
  'LOCK_TIMEOUT',
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_ERROR'
];

async function callApiPost(action, payload = {}) {
  const isPublic = PUBLIC_ACTIONS.includes(action);
  const isIdentityBootstrap = IDENTITY_BOOTSTRAP_ACTIONS.includes(action);
  const isProtectedWrite = PROTECTED_WRITE_ACTIONS.includes(action);

  // 1. Auth Readiness Gates (送信前の安全な待機)
  if (!isPublic) {
    if (typeof window !== 'undefined' && typeof window.waitForLiffAuthReady === 'function') {
      await window.waitForLiffAuthReady();
    }
    if (isProtectedWrite) {
      if (typeof window !== 'undefined' && typeof window.waitForIdentityVerified === 'function') {
        await window.waitForIdentityVerified();
      }
    }
  }

  const MAX_RETRIES = 3;
  const districtId = (typeof window !== 'undefined' && window.PMS_CLIENT_CONFIG && window.PMS_CLIENT_CONFIG.districtId) || "";
  if (districtId && !payload.districtId) {
    payload.districtId = districtId;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // リトライ毎に最新の有効トークンを動的取得
    const token = getLiffAuthToken();
    if (token) {
      payload.liffToken = token;
    }

    const url = `${API_URL}?_t=${Date.now()}`;
    const body = JSON.stringify({ action, ...payload });

    const options = {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow'
    };

    try {
      logDebug(`[callApiPost] START (Attempt ${attempt}/${MAX_RETRIES}): action=${action}, bodySize=${body.length}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      let response;
      try {
        response = await fetch(url, { ...options, body, signal: controller.signal });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        const netErr = new Error(fetchErr.name === 'AbortError' ? "通信がタイムアウトしました (90秒)" : `ネットワークエラー: ${fetchErr.message}`);
        netErr.code = "NETWORK_FAILURE";
        netErr.errorType = "TRANSIENT";
        netErr.retryable = true;
        throw netErr;
      }
      clearTimeout(timeoutId);
      logDebug(`[callApiPost] FETCH OK. status=${response.status}`);

      if (!response.ok) {
        const httpErr = new Error(`HTTP Error: ${response.status}`);
        httpErr.code = response.status === 401 ? "UNAUTHORIZED" : (response.status >= 500 ? "INTERNAL_ERROR" : "NETWORK_FAILURE");
        httpErr.errorType = response.status >= 500 ? "TRANSIENT" : "PERMANENT";
        httpErr.retryable = response.status >= 500;
        throw httpErr;
      }

      const text = await response.text();
      logDebug(`[callApiPost] TEXT RECEIVED (length=${text.length})`);

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        const jsonErr = new Error("JSON形式ではない応答を受け取りました: " + parseErr.message);
        jsonErr.code = "MALFORMED_JSON";
        jsonErr.errorType = "PERMANENT";
        jsonErr.retryable = false;
        throw jsonErr;
      }

      // レスポンスの展開とエラーチェック
      let targetResult = data;
      if (data && typeof data === 'object' && 'data' in data && data.data !== null) {
        targetResult = data.data;
      }

      if (targetResult && targetResult.success === false) {
        const apiErr = new Error(targetResult.message || data.message || "API Error");
        apiErr.code = targetResult.code || data.code || "UNKNOWN_ERROR";
        apiErr.errorType = targetResult.errorType || data.errorType || "PERMANENT";
        apiErr.retryable = targetResult.retryable !== undefined ? targetResult.retryable : (data.retryable !== undefined ? data.retryable : TRANSIENT_ERROR_CODES.includes(apiErr.code));
        throw apiErr;
      }

      return targetResult;

    } catch (err) {
      logDebug(`[callApiPost] Attempt ${attempt} failed: [${err.code || 'NO_CODE'}] ${err.message}`);

      // リトライ判定: Backendの retryable を優先、未定義時は TRANSIENT_ERROR_CODES 照合 (Fail-Closed)
      const isRetryable = err.retryable === true || (err.retryable === undefined && TRANSIENT_ERROR_CODES.includes(err.code));

      if (!isRetryable || attempt === MAX_RETRIES) {
        console.error(`API POST Error (${action}):`, err);
        throw err;
      }

      // wait = 1s → 2s (3回目失敗後は待ちなしでthrow)
      const waitMs = attempt === 1 ? 1000 : 2000;
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

window.getApiUrl = getApiUrl;
window.getLiffAuthToken = getLiffAuthToken;
window.callApiPost = callApiPost;
