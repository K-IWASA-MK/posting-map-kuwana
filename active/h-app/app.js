const $ = id => document.getElementById(id);

// SEC-004: XSS対策用エスケープ関数
window.escapeHtml = function(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// 暗号学的UUID v4 + 実機フォールバック対応のRequestId生成関数 (冪等性キー)
window.generateRequestId = function(prefix = 'req') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return `${prefix}_${crypto.randomUUID()}`;
    } catch (e) {}
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return `${prefix}_${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    } catch (e) {}
  }
  const p = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? Math.floor(performance.now() * 1000) : 0;
  return `${prefix}_${Date.now()}_${p}_${Math.random().toString(36).substring(2, 11)}`;
};

// デバッグログ出力関数 (本番用: コンソールのみ出力)
window.logDebug = function(msg) {
  console.log("[DEBUG]", msg);
};
window.onerror = function(message, source, lineno, colno, error) {
  if (message === "Script error.") return false;
  logDebug(`ERROR: ${message} at ${source}:${lineno}:${colno}`);
  return false;
};
window.onunhandledrejection = function(event) {
  logDebug(`UNHANDLED PROMISE: ${event.reason}`);
};

let allPoints = [], rankingData = [];
let _rankingFetched = false;  // ランキング遅延取得済みフラグ

let currentCity = null;
window.activeRankingPromise = null;


// ─── グローバル・ローディング二重制御ヘルパー ─────────────────────
let _loadingCount = 0;

function showLoading(label = 'CONNECTING...') {
  _loadingCount++;
  const loadingEl = $('loading');
  if (loadingEl) {
    const statusEl = $('loading-status');
    if (statusEl) statusEl.textContent = label;
    loadingEl.classList.remove('hidden');
    loadingEl.classList.remove('opacity-0');
  }
}

function hideLoading() {
  _loadingCount = Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0) {
    const loadingEl = $('loading');
    if (loadingEl) {
      loadingEl.classList.add('opacity-0');
      setTimeout(() => {
        if (_loadingCount === 0) {
          loadingEl.classList.add('hidden');
        }
      }, 300);
    }
  }
}

function setLoadingProgress(pct, label) {
  const bar = document.getElementById('loading-bar');
  const txt = document.getElementById('loading-status');
  if (bar) bar.style.width = pct + '%';
  if (txt) {
    txt.style.opacity = '0';
    setTimeout(() => { txt.textContent = label; txt.style.opacity = '1'; }, 180);
  }
}

// プレミアム・インタラクション・スキル (JS Touch Handler)
document.addEventListener('touchstart', e => {
  const el = e.target.closest('.btn-neu, .clickable-card, .nav-btn');
  if (!el) return;
  if (el.classList.contains('btn-neu')) el.classList.add('pressed-primary');
  if (el.classList.contains('clickable-card')) el.classList.add('pressed-secondary');
  if (el.classList.contains('nav-btn')) el.classList.add('pressed-nav');
}, {passive: true});

document.addEventListener('touchend', removePressed);
document.addEventListener('touchcancel', removePressed);
function removePressed() {
  document.querySelectorAll('.pressed-primary, .pressed-secondary, .pressed-nav').forEach(el => {
    el.classList.remove('pressed-primary', 'pressed-secondary', 'pressed-nav');
  });
}

// =====================================
// Phase 4-B: Global Pin Status Sync (Thin Wiring Wrapper)
// =====================================
window.fetchGlobalPinStatus = async function() {
  return PinStatusModule.fetchStatus({
    onStatusUpdated: () => {
      if (typeof window.refreshMainMapPins === 'function') {
        window.refreshMainMapPins();
      }
    },
    onError: (err) => {
      logDebug(`[fetchGlobalPinStatus] Error: ${err.message}`);
    }
  });
};

// --- Auth Readiness Gate (LIFF認証完了待機: PENDING / READY / FAILED) ---
let _liffAuthState = 'PENDING'; // 'PENDING' | 'READY' | 'FAILED'
let _liffAuthError = null;
let _liffAuthReadyResolver = null;
let _liffAuthReadyRejecter = null;
const _liffAuthReadyPromise = new Promise((resolve, reject) => {
  _liffAuthReadyResolver = resolve;
  _liffAuthReadyRejecter = reject;
});
// 未購読rejectによる unhandledrejection 警告を防止
_liffAuthReadyPromise.catch(() => {});

function waitForLiffAuthReady() {
  const currentToken = typeof getLiffAuthToken === 'function' ? getLiffAuthToken() : null;
  const hasValidToken = typeof currentToken === 'string' && currentToken.trim().length > 0;

  // 1. 現時点で有効な token が存在し、かつログイン済みなら即時 resolve
  if (typeof liff !== 'undefined' && liff.isLoggedIn && liff.isLoggedIn() && hasValidToken) {
    return Promise.resolve(true);
  }

  // 2. 過去に READY に遷移していたとしても、現時点で token が失われていれば過去の resolve を信用せず即時 reject
  if (_liffAuthState === 'READY') {
    const err = new Error("LIFF_TOKEN_MISSING");
    err.code = "UNAUTHORIZED";
    err.errorType = "PERMANENT";
    err.retryable = false;
    return Promise.reject(err);
  }

  // 3. FAILED 状態なら明示的 reject
  if (_liffAuthState === 'FAILED') {
    return Promise.reject(_liffAuthError || new Error("LIFF_AUTH_FAILED"));
  }

  // 4. PENDING 状態（init実行中）なら Promise 待機
  return _liffAuthReadyPromise;
}
window.waitForLiffAuthReady = waitForLiffAuthReady;

// 明示的な Read-only Accessor (Fail-Closed)
window.isLiffAuthReady = function() {
  if (typeof liff === 'undefined' || !liff.isLoggedIn || !liff.isLoggedIn()) return false;
  const token = typeof getLiffAuthToken === 'function' ? getLiffAuthToken() : null;
  return typeof token === 'string' && token.trim().length > 0;
};

// --- Identity Safety Gate (Verified後のみ業務Write許可) ---
let _identityVerified = false;
let _identitySyncPromise = null;
let _identityLastError = null;

async function waitForIdentityVerified() {
  if (_identityVerified === true) return true;

  if (_identitySyncPromise) {
    await _identitySyncPromise;

    if (_identityVerified === true) return true;

    throw _identityLastError ||
      Object.assign(new Error('IDENTITY_NOT_VERIFIED'), {
        code: 'UNAUTHORIZED',
        errorType: 'PERMANENT',
        retryable: false
      });
  }

  throw Object.assign(new Error('IDENTITY_NOT_INITIALIZED'), {
    code: 'UNAUTHORIZED',
    errorType: 'PERMANENT',
    retryable: false
  });
}
window.waitForIdentityVerified = waitForIdentityVerified;

window.isIdentityVerifiedReady = function() {
  return window.isLiffAuthReady() && _identityVerified === true;
};

// =====================================
// Phase 4-B: Pin In-Progress Control (Thin Wiring Wrapper)
// =====================================
window.setPinInProgress = function(rowId, action) {
  return PinStatusModule.setInProgress(rowId, action, {
    authorize: () => waitForIdentityVerified(),
    onError: (err) => {
      logDebug(`[setPinInProgress] Error/Blocked: ${err.message}`);
    }
  });
};

let appStartupTriggered = false;
let mainAppVisible = false;

function showMainApp() {
  if (mainAppVisible || window.__contractExpired) return;

  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  if (!userInfo.id) return;

  mainAppVisible = true;

  // 初期画面（page-settings）のDOMを同期的に完全確定させる
  if (typeof renderSettings === 'function') {
    renderSettings();
  }
  updateBottomNavVisibility();

  const navContainer = document.getElementById('bottom-nav');
  const renderNavFn = window.renderBottomNavigation || (typeof renderBottomNavigation === 'function' ? renderBottomNavigation : null);
  if (navContainer && renderNavFn) {
    navContainer.innerHTML = renderNavFn('settings');
  }

  // 初期ページを同期的に settings に即時確定（200msアニメーション遅延による未描画フレームを排除）
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => {
    if (p.id === 'page-settings') {
      p.classList.remove('hidden');
      p.style.opacity = '1';
      p.style.transform = 'translateY(0)';
    } else {
      p.classList.add('hidden');
      p.style.opacity = '0';
    }
  });

  $('app').classList.remove('hidden');
  $('app').classList.remove('opacity-0');

  const loadingEl = $('loading');
  if (loadingEl) {
    loadingEl.classList.add('opacity-0');
    setTimeout(() => loadingEl.classList.add('hidden'), 400);
  }
}

function loadGoogleMapsApi() {
  if (window.googleMapsApiLoaded) return;
  window.googleMapsApiLoaded = true;

  callApiPost('getMapsApiKey').then(keyData => {
    if (keyData && keyData.success && keyData.mapsApiKey) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${keyData.mapsApiKey}&callback=initMainMap&language=ja`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else {
      window.googleMapsApiLoaded = false;
    }
  }).catch(err => {
    window.googleMapsApiLoaded = false;
    logDebug("[loadGoogleMapsApi] Error: " + (err ? err.message : err));
  });
}

async function startApp() {
  if (appStartupTriggered) return;
  appStartupTriggered = true;

  try {
    loadGoogleMapsApi();

    // 起動時の未送信キュー復旧・送信処理（クラッシュ・オフライン復旧）
    if (typeof processQueue === 'function') {
      processQueue();
    }

    loadData(false).catch(err => {
      console.warn("Background load error:", err);
      logDebug("[loadData] Background error: " + (err ? err.message : err));
    });

    showMainApp();
  } catch (err) {
    console.error("Startup error:", err);
    logDebug("Startup error: " + err.message);
  }
}

function setSyncStatus(state) {
  const statusEl = $('sync-status');
  const textEl = $('sync-text');
  if (!statusEl) return;
  statusEl.className = 'w-2 h-2 rounded-full transition-all duration-300';

  if (textEl) {
    textEl.className = 'text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-300';
  }

  if (state === 'online') {
    statusEl.classList.add('bg-[#22c55e]', 'shadow-[0_0_8px_#22c55e]', 'animate-soft-pulse');
    if (textEl) {
      textEl.textContent = 'ONLINE';
      textEl.classList.add('text-[#22c55e]');
    }
  } else if (state === 'offline') {
    statusEl.classList.add('bg-[#f59e0b]', 'shadow-[0_0_8px_#f59e0b]');
    if (textEl) {
      textEl.textContent = 'OFFLINE';
      textEl.classList.add('text-[#f59e0b]');
    }
  } else if (state === 'syncing') {
    statusEl.classList.add('bg-[#2563eb]', 'shadow-[0_0_8px_#2563eb]', 'animate-pulse');
    if (textEl) {
      textEl.textContent = 'SYNCING';
      textEl.classList.add('text-[#2563eb]', 'animate-pulse');
    }
  }
}

let isRegistering = false;
let registrationError = false;
let activeRegistrationPromise = null;
function triggerBackgroundRegistration(profile) {
  window.liffProfile = profile;
  if (activeRegistrationPromise) {
    return activeRegistrationPromise;
  }
  isRegistering = true;
  window.isRegistering = true;
  registrationError = false;
  window.registrationError = false;

  const idEl = $('storage-register-staff-id');
  if (idEl) {
    idEl.textContent = 'ID: 登録中...';
    idEl.style.color = 'inherit';
    idEl.style.cursor = 'default';
    idEl.onclick = null;
  }

  logDebug("API START (初回登録・非同期)");
  activeRegistrationPromise = callApiPost('registerStaff', {
    lastName: profile.displayName,
    firstName: "(LINE)",
    lineUserId: profile.userId
  }).then(res => {
    logDebug("API OK (初回登録完了)");
    if (res && res.success && res.id && String(res.id).trim() !== '') {
      const registeredInfo = {
        last: profile.displayName,
        first: "",
        id: res.id,
        picture: profile.pictureUrl
      };
      localStorage.setItem('user_info', JSON.stringify(registeredInfo));
      logDebug("Registered! Staff ID: " + res.id);

      const updatedIdEl = $('storage-register-staff-id');
      if (updatedIdEl) {
        updatedIdEl.textContent = 'ID: ' + (res.id || '---');
        updatedIdEl.style.color = 'inherit';
        updatedIdEl.style.cursor = 'default';
        updatedIdEl.onclick = null;
      }

      if (typeof renderSettings === 'function') {
        renderSettings();
      }
      updateBottomNavVisibility();
      return res;
    } else {
      const errMsg = (res && res.error) ? res.error : "GAS registration returned invalid response (missing id)";
      throw new Error(errMsg);
    }
  }).catch(err => {
    registrationError = true;
    window.registrationError = true;
    logDebug("Background registration failed: " + (err ? err.message : err));

    const updatedIdEl = $('storage-register-staff-id');
    if (updatedIdEl) {
      updatedIdEl.textContent = 'ID: 登録失敗 (タップして再試行)';
      updatedIdEl.style.color = '#ef4444';
      updatedIdEl.style.cursor = 'pointer';
      updatedIdEl.onclick = () => {
        window.retryRegistration();
      };
    }

    // エラー時は未完成画面を表示させず、ローディング画面でエラーと再試行を提示
    const loadingStatusEl = $('loading-status');
    if (loadingStatusEl) {
      loadingStatusEl.textContent = '登録エラー (タップして再試行): ' + (err.message || '通信失敗');
      loadingStatusEl.style.color = '#ef4444';
      loadingStatusEl.style.cursor = 'pointer';
      loadingStatusEl.onclick = () => {
        loadingStatusEl.textContent = '再試行中...';
        loadingStatusEl.style.color = 'inherit';
        loadingStatusEl.onclick = null;
        window.retryRegistration();
      };
    }
    throw err;
  }).finally(() => {
    isRegistering = false;
    window.isRegistering = false;
    activeRegistrationPromise = null;
  });

  return activeRegistrationPromise;
}

// 登録再試行用のグローバルハンドラーを公開
window.retryRegistration = () => {
  if (window.liffProfile) {
    return triggerBackgroundRegistration(window.liffProfile).then(() => {
      const verifiedInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
      if (verifiedInfo && verifiedInfo.id) {
        setLoadingProgress(100, 'READY');
        _identityVerified = true;
        showMainApp();
      }
    }).catch(err => {
      logDebug("Retry registration failed: " + (err ? err.message : err));
    });
  }
};

async function loadData(skipSync = false) {
  logDebug("[loadData] START (Background)");

  const tier1Promise = fetchTier1();

  if (!skipSync) {
    setSyncStatus(navigator.onLine ? 'online' : 'offline');
  }

  await tier1Promise;

  // 待機中キューのピン状態復元（強制終了・クラッシュ復旧）
  if (typeof window.getSyncQueueRowIds === 'function') {
    try {
      const queueRowIds = await window.getSyncQueueRowIds();
      if (queueRowIds && queueRowIds.length > 0 && Array.isArray(allPoints)) {
        queueRowIds.forEach(rowId => {
          const pt = allPoints.find(p => Number(p.rowId) === Number(rowId));
          if (pt && !pt.isDone) {
            pt.syncStatus = 'pending';
          }
        });
      }
    } catch (qErr) {
      console.warn("[loadData] Failed to restore pending queue pins:", qErr);
    }
  }
}

// ランキングデータのバックグラウンド先読み関数
function prefetchRanking() {
  window.activeRankingPromise = callApiPost('getRanking')
    .then(data => {
      if (data && data.success) {
        rankingData = data.ranking || [];
        window._myRankingSummary = data.mySummary || null;
        _rankingFetched = true;
        logDebug("[prefetchRanking] Ranking pre-fetched in background.");
        // 現在ランキングページを表示中であれば再描画
        const activePage = document.querySelector('.page:not(.hidden)');
        if (activePage && activePage.id === 'page-ranking' && typeof renderRanking === 'function') {
          renderRanking();
        }
      }
      return data;
    })
    .catch(err => {
      logDebug("[prefetchRanking] Failed to pre-fetch ranking: " + err.message);
      return null;
    });
}

let numpadContext = null;

function openNumpad(areaName, rowId, initialCount, isDoneToggle = false, checkbox = null) {
  numpadContext = {
    areaName,
    rowId,
    isDoneToggle,
    checkbox,
    currentVal: initialCount ? String(initialCount) : '0'
  };

  $('numpad-display').textContent = numpadContext.currentVal;

  const modal = $('numpad-modal');
  modal.classList.remove('pointer-events-none', 'opacity-0');
  const content = modal.firstElementChild;
  content.classList.remove('translate-y-full');
}

function closeNumpad() {
  if (!numpadContext) return;

  if (numpadContext.isDoneToggle && numpadContext.checkbox) {
    numpadContext.checkbox.checked = false;
  }

  const modal = $('numpad-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
  const content = modal.firstElementChild;
  content.classList.add('translate-y-full');

  numpadContext = null;
}


window.triggerUISyncRefresh = async function() {
  if (!allPoints || allPoints.length === 0) return; // let変数は window に付かないため直接参照
  if (typeof getQueue !== 'function') return;

  try {
    const queue = await getQueue();
    const nowTs = Date.now();
    const dNow = new Date(nowTs + (9 * 60 * 60 * 1000));
    const currentJstMonth = `${dNow.getUTCFullYear()}-${String(dNow.getUTCMonth() + 1).padStart(2, '0')}`;

    allPoints.forEach(p => {
      // submitting（提出処理中）の場合はキュー状態での上書きを防止
      if (p.syncStatus === 'submitting') return;

      const found = queue.find(q => {
        if (Number(q.rowId) !== Number(p.rowId)) return false;
        const qTs = Number(q.timestamp) || nowTs;
        const qD = new Date(qTs + (9 * 60 * 60 * 1000));
        const qM = `${qD.getUTCFullYear()}-${String(qD.getUTCMonth() + 1).padStart(2, '0')}`;
        return qM === currentJstMonth;
      });
      if (found) {
        p.syncStatus = found.syncStatus || found.status; // 'pending' | 'sending' | 'failed'
      } else {
        // キューに存在しない場合（Queue消滅だけを根拠にCOMPLETEDへ新規昇格させることは絶対禁止）
        if (p.syncStatus === 'REJECTED') {
          // STALE_MONTH 等の非受諾終端: COMPLETED に昇格させず未完了へ戻す（submitMissionComplete の判定のため消去しない）
          p.isDone = false;
          delete p.isReadyToSubmit;
          delete p.tempPhotoUrl;
        } else if (p.isDone === true) {
          // Backend正常受諾済み（db.js により p.isDone = true 確定済み）の場合のみ完了状態・ピンロックを維持
          delete p.isReadyToSubmit;
          delete p.tempPhotoUrl;
          delete p.syncStatus;
          PinStatusModule.reflectCompleted(p.rowId);
          if (typeof window.lockActivePinAndBubble === 'function') {
            window.lockActivePinAndBubble(p.rowId);
          }
        } else if (!p.isDone) {
          delete p.syncStatus;
        }
      }
    });

    // 開いている詳細モーダルの再描画
    if (window.currentPointDetailRowId) {
      const p = allPoints.find(point => point.rowId === window.currentPointDetailRowId);
      const modalContent = $('detail-modal-content');
      if (p && p.syncStatus !== 'submitting' && modalContent && typeof renderDetailModalContent === 'function') {
        modalContent.innerHTML = renderDetailModalContent(p);
      }
    }
  } catch (err) {
    console.error("triggerUISyncRefresh error:", err);
  }
};


function pressNum(key) {
  if (!numpadContext) return;

  if (key === 'C') {
    numpadContext.currentVal = '0';
  } else if (key === 'OK') {
    const valNum = parseFloat(numpadContext.currentVal) || 0;
    const { areaName, rowId } = numpadContext;

    const p = allPoints.find(point => point.rowId === rowId);
    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
    const staffId = userInfo.id || '';
    const now = new Date();
    const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    numpadContext.isDoneToggle = false;

    // GPS・カメラを先に開始（ユーザーのタップジェスチャーが生きている間に呼ぶ）
    const gpsPromise = getGPSLocation();
    // capturePhoto()内のinput.click()はここで同期的に実行される
    // → テンキーを閉じる前にカメラが起動するため、裏画面が一瞬見える現象を防ぐ
    const cameraPromise = capturePhoto();

    closeNumpad(); // カメラ起動後にテンキーを閉じる

    // 2. バックグラウンドで写真取得完了とGPS結果を待つ
    (async () => {
      let imageBlob = null;
      try {
        imageBlob = await cameraPromise;
      } catch (err) {
        console.error("Camera activation failed:", err);
      }

      // カメラがキャンセルされた場合は処理を中断
      if (!imageBlob || typeof window.blobToBase64 !== 'function') {
        console.warn("Photo capture cancelled or failed. Mission completion aborted.");
        return;
      }

      let photoBase64 = '';
      try {
        photoBase64 = await window.blobToBase64(imageBlob);
      } catch (err) {
        console.warn("Photo Base64 conversion threw an error.", err);
      }

      if (!photoBase64) {
        console.warn("Photo Base64 conversion returned empty data. Mission completion aborted.");
        return;
      }

      // 3. 写真確定後に状態を更新し、即座にMISSION COMPLETED画面を生成（GPSは待たない）
      if (p) {
        // Phase 9: 写真・GPS取得完了は DRAFT (READY_TO_SUBMIT) であり、Backend永続化成功前の COMPLETED 確定ではない
        p.isDone = false;
        p.isReadyToSubmit = true;
        p.count = valNum;
        p.staffName = staffName;
        p.staffId = staffId; // Payload用に保持
        p.completedAt = timeStr;
        p.syncStatus = 'pending';
        p.gpsStatus = 'pending';
        p.photoStatus = 'OK';

        p.tempPhotoUrl = URL.createObjectURL(imageBlob);
        p.photoBase64 = photoBase64;

        // モーダルを再描画（提出前プレビュー画面として表示するため isDone: true のプロパティを渡す）
        const modalContent = $('detail-modal-content');
        if (modalContent) {
          modalContent.innerHTML = renderDetailModalContent({ ...p, isDone: true });
        }
      }

      // 4. バックグラウンドでGPS結果を待機
      let gps = await gpsPromise;
      if (!gps.latitude || !gps.longitude) {
        console.log("GPS empty after camera, retrying...");
        gps = await getGPSLocation();
      }

      // GPS判定
      const latNum = Number(gps?.latitude);
      const lngNum = Number(gps?.longitude);
      const hasValidGps =
        Number.isFinite(latNum) &&
        Number.isFinite(lngNum) &&
        latNum !== 0 &&
        lngNum !== 0 &&
        latNum >= -90 && latNum <= 90 &&
        lngNum >= -180 && lngNum <= 180;

      if (p) {
        if (!hasValidGps) {
          console.warn("GPS acquisition failed or out of range.");
          p.gpsStatus = 'NO';
        } else {
          p.gpsStatus = 'OK';
          p.gps = `${gps.latitude},${gps.longitude}`;
          p.latitude = gps.latitude;
          p.longitude = gps.longitude;
          p.accuracy = gps.accuracy || null;
        }

        // GPS状態が確定したのでモーダルのみ再描画（提出処理中はUIを上書きしない）
        const modalContent = $('detail-modal-content');
        if (modalContent && p.syncStatus !== 'submitting') {
          modalContent.innerHTML = renderDetailModalContent(p.isDone ? p : { ...p, isDone: true });
        }
      }
    })().catch(err => {
      console.error("Async sync background task failed:", err);
    });

    return;
  } else {
    if (numpadContext.currentVal === '0') {
      numpadContext.currentVal = String(key);
    } else {
      if (numpadContext.currentVal.length < 5) {
        numpadContext.currentVal += String(key);
      }
    }
  }

  $('numpad-display').textContent = numpadContext.currentVal;
}

// モーダルの「この内容で提出する」ボタン押下時に呼ばれる
async function submitMissionComplete(areaName, rowId) {
  const p = (typeof allPoints !== 'undefined' && Array.isArray(allPoints) && allPoints.find(point => point.rowId === rowId)) ||
            (typeof window.allPoints !== 'undefined' && Array.isArray(window.allPoints) && window.allPoints.find(point => point.rowId === rowId));
  if (!p) return;

  // Phase 11 ガード: 完了確定した地区は当月再操作不可 (既存業務ルール維持)
  const isAlreadyCompleted = PinStatusModule.isCompleted(rowId) ||
                             (p.isDone && !p.isReadyToSubmit);
  if (isAlreadyCompleted) {
    alert("この地区は既に今月の配布が完了しています。再操作はできません。");
    if (typeof closeDetailModal === 'function') closeDetailModal();
    return;
  }

  if (p.syncStatus === 'submitting') return;
  p.syncStatus = 'submitting';

  if (p.photoStatus !== 'OK' || !p.photoBase64) {
    p.syncStatus = 'pending';
    return;
  }

  const submitBtn = $('submit-mission-btn');
  const cancelBtn = $('cancel-mission-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 提出中...';
  }
  if (cancelBtn) {
    cancelBtn.disabled = true;
  }

  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

  try {
    while (p.gpsStatus === 'pending') {
      await new Promise(r => setTimeout(r, 200));
    }

    // Safety Gate: Identity Verified を確認
    try {
      await waitForIdentityVerified();
    } catch (authErr) {
      alert("スタッフ認証が完了していないため、配布完了を送信できません。再起動してください。");
      p.syncStatus = 'failed';
      p.isDone = false; // Phase 9: 認証失敗時は配布完了としない
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 この内容で提出する';
      }
      if (cancelBtn) cancelBtn.disabled = false;
      return;
    }

    // 最新の認証済み user_info を再取得して staffId / staffName を確定
    const verifiedUserInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const finalStaffId = verifiedUserInfo.id || p.staffId || '';
    const finalStaffName = `${verifiedUserInfo.last || ''} ${verifiedUserInfo.first || ''}`.trim() || p.staffName || '';

    // クライアント不変操作識別子 (requestId) を発番
    const requestId = (typeof window.generateRequestId === 'function')
      ? window.generateRequestId('req')
      : ('req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));

    // 原本仕様: 活動送信ごとに一意の clientEventId (冪等性キー) を対応付け (ADR-013)
    const clientEventId = requestId;

    if (typeof enqueueSync === 'function') {
      // 1. IndexedDB 送信キューに永続化
      await enqueueSync({
        requestId,
        areaName,
        clientEventId,
        rowId: Number(rowId),
        isDone:     true,
        count:      p.count || 0,
        latitude:   p.gpsStatus === 'OK' ? (p.latitude || '') : '',
        longitude:  p.gpsStatus === 'OK' ? (p.longitude || '') : '',
        accuracy:   p.gpsStatus === 'OK' ? (p.accuracy || null) : null,
        gpsTimestamp: p.gpsStatus === 'OK' ? (p.gpsTimestamp || '') : '',
        gpsStatusReason: p.gpsStatus || 'NO',
        branchCode: localStorage.getItem('branch_name') || '',
        areaId:     String(rowId),
        photoBase64: p.photoBase64 || '',
        staffName:  finalStaffName,
        staffId:    finalStaffId
      });

      // 2. オフライン判定：オフライン時は即時モーダルを閉じて画面を解放（UIフリーズを完全阻止）
      if (!navigator.onLine) {
        p.syncStatus = 'pending';
        p.isDone = false;
        alert("電波が圏外のため、端末内に安全に保存しました。\n電波が回復次第、自動で送信されます。");
        if (typeof closeDetailModal === 'function') {
          closeDetailModal();
        }
        return;
      }

      // 3. オンライン時：最大15秒間の待機（while(true)無限待機を撤廃しタイムアウト上限を設定）
      const maxWaitMs = 15000;
      const startTime = Date.now();
      let isPersisted = false;

      while (Date.now() - startTime < maxWaitMs) {
        if (typeof window.getRowStatus !== 'function') {
          throw new Error("Sync check mechanism is missing.");
        }
        const status = await window.getRowStatus(Number(rowId));

        if (status === null) {
          // キューから消滅
          if (p.syncStatus === 'REJECTED') {
            // STALE_MONTH 等の非受諾終端: COMPLETED に昇格させず通常未完了へ復帰
            p.isDone = false;
            delete p.isReadyToSubmit;
            delete p.tempPhotoUrl;
            delete p.syncStatus;
            alert("旧月の配布操作のため、当月シートには反映されませんでした。");
            if (typeof closeDetailModal === 'function') {
              closeDetailModal();
            }
            return; // 重要：後段の「送信処理中です」へ落ちずに即時終了
          }

          // 正常完了判定: Queue消滅かつ (db.js により p.isDone === true 確定 または PinStatusModule.isCompleted 反映済み)
          const isCompletedInPinStatus = Boolean(PinStatusModule.isCompleted(rowId));
          if (isCompletedInPinStatus) {
            p.isDone = true;
          }

          if (p.isDone === true) {
            p.isDone = true;
            delete p.isReadyToSubmit;
            p.syncStatus = 'synced';
            PinStatusModule.reflectCompleted(rowId);
            if (typeof window.lockActivePinAndBubble === 'function') {
              window.lockActivePinAndBubble(rowId);
            }
            isPersisted = true;
            break;
          }

          // status === null かつ p.isDone !== true かつ p.syncStatus !== 'REJECTED' の場合:
          // Queue消滅だけから成功を推定せず、待機ループ内で受諾結果確定（p.isDone または REJECTED）を待つ
        }
        if (status === 'RETRY') {
          throw new Error("GAS Save Failed");
        }
        await new Promise(r => setTimeout(r, 500));
      }

      // 4. 完了または待機完了後の画面解放
      if (isPersisted) {
        alert("✓ 提出致しました");
      } else {
        // 15秒経過後もバックグラウンドで継続中：通常操作へ復帰
        p.syncStatus = 'pending';
        p.isDone = false;
        alert("送信処理中です。バックグラウンドで送信を継続します。");
      }

      if (typeof closeDetailModal === 'function') {
        closeDetailModal();
      }
    }
  } catch (err) {
    console.error("Submission failed:", err);
    alert("提出に失敗しました: " + (err.message || "エラー"));
    p.syncStatus = 'pending';
    // Phase 9: Backend永続化が成功していないため、配布完了を確定させない (COMPLETED = false)
    p.isDone = false;
  } finally {
    const submitBtn = $('submit-mission-btn');
    const cancelBtn = $('cancel-mission-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 この内容で提出する';
    }
    if (cancelBtn) {
      cancelBtn.disabled = false;
    }
  }
}

window.addEventListener('online', () => {
  setSyncStatus('online');
});

window.addEventListener('offline', () => {
  console.log("Device went offline.");
  setSyncStatus('offline');
});

window.onPageEnter = function(id) {
  if (id === 'settings') renderSettings();
  if (id === 'ranking') initRankingPage();
  if (id === 'storage-register') initStorageRegisterPage();
  if (id === 'storage-list') initStorageListPage();
  if (id === 'bulletin' && typeof fetchBulletinPosts === 'function') fetchBulletinPosts();

  // エリア（MAP）画面表示時: display:none解除に伴うリサイズ同期 & 初回Visible-fit保証
  if (id === 'areas' && window.mainMapInstance && window.google && window.google.maps) {
    google.maps.event.trigger(window.mainMapInstance, 'resize');

    let initialFitRan = false;
    if (typeof window.ensureMainMapInitialFit === 'function') {
      initialFitRan = window.ensureMainMapInitialFit();
    }

    // 初回fitを実行した場合は、旧center上書きを行わずfit結果のCameraを優先
    if (!initialFitRan) {
      // 初回fit完了後の通常再訪時: ユーザーのPan/Zoom状態（currentMapState）を維持復元
      const center = window.currentMapState?.center;
      if (center) {
        window.mainMapInstance.setCenter(center);
      }
    }
  }
};

function initRankingPage() {
  const container = $('ranking-list');
  if (!_rankingFetched) {
    if (container) {
      container.innerHTML = `
        <div style="border: 1px solid rgba(255,255,255,0.04);" class="premium-glass p-8 flex flex-col items-center justify-center text-center gap-3">
          <div class="w-8 h-8 rounded-full border-2 border-[#2563eb]/40 border-t-[#2563eb] animate-spin"></div>
          <p class="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Loading Leaderboard...</p>
        </div>`;
    }
    const p = window.activeRankingPromise || callApiPost('getRanking');
    p.then(data => {
      if (data && data.success) {
        rankingData = data.ranking || [];
        window._myRankingSummary = data.mySummary || null;
        _rankingFetched = true;
      }
      if (typeof renderRanking === 'function') renderRanking();
    }).catch(() => {
      if (typeof renderRanking === 'function') renderRanking();
    });
  } else {
    if (typeof renderRanking === 'function') renderRanking();
  }
}

function initStorageRegisterPage() {
  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffId = userInfo.id || '';
  const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();
  const idEl = $('storage-register-staff-id');
  const nameEl = $('storage-register-staff-name');

  if (idEl) {
    if (staffId) {
      idEl.textContent = 'ID: ' + staffId;
      idEl.style.color = 'inherit';
      idEl.style.cursor = 'default';
      idEl.onclick = null;
    } else if (isRegistering) {
      idEl.textContent = 'ID: 登録中...';
      idEl.style.color = 'inherit';
      idEl.style.cursor = 'default';
      idEl.onclick = null;
    } else if (registrationError) {
      idEl.textContent = 'ID: 登録失敗 (タップして再試行)';
      idEl.style.color = '#ef4444';
      idEl.style.cursor = 'pointer';
      idEl.onclick = async () => {
        try {
          idEl.textContent = 'ID: 再登録中...';
          idEl.style.color = 'inherit';
          const profile = await liff.getProfile();
          triggerBackgroundRegistration(profile);
        } catch(e) {
          idEl.textContent = 'ID: 登録失敗 (タップして再試行)';
          idEl.style.color = '#ef4444';
        }
      };
    } else {
      idEl.textContent = 'ID: ---';
      idEl.style.color = 'inherit';
      idEl.style.cursor = 'default';
      idEl.onclick = null;
    }
  }
  if (nameEl) nameEl.textContent = staffName || '---';

  const countInput = $('storage-register-count');
  StorageView.setupRegisterInputFormatter(countInput);

  const locSelect = $('storage-register-location');
  if (locSelect && !locSelect.dataset.changeBound) {
    locSelect.dataset.changeBound = 'true';
    locSelect.addEventListener('change', function() {
      this.dataset.userSelected = 'true';
      StorageView.updateLocationDisplayText();
    });
  }

  StorageView.updateLocationDropdown(StorageModule.getSnapshot().locations, null, typeof tier1Cache !== 'undefined' ? tier1Cache : null);

  const snapshot = StorageModule.getSnapshot();
  if (!snapshot.locations) {
    StorageModule.getLocations().then(cities => {
      StorageView.updateLocationDropdown(cities, null, typeof tier1Cache !== 'undefined' ? tier1Cache : null);
    });
  }

  if (snapshot.fetched && Array.isArray(snapshot.stocks) && snapshot.stocks.length > 0) {
    StorageView.applyMyStockToForm(snapshot, { isAsyncResponse: false });
  }

  if (staffId && countInput) {
    StorageModule.fetchStock().then(data => {
      if (data && data.success && Array.isArray(data.stocks)) {
        StorageView.applyMyStockToForm(StorageModule.getSnapshot(), { isAsyncResponse: true });
      }
    }).catch(err => {
      console.warn('[initStorageRegisterPage] fetchFlyerStock failed:', err);
      StorageView.updateCountDisplay();
      StorageView.updateRegisterButtonText();
    });
  }

  StorageView.updateCountDisplay();
  StorageView.updateRegisterButtonText();
}

function initStorageListPage() {
  const listContainer = $('storage-list-container');
  const snapshot = StorageModule.getSnapshot();

  if (!snapshot.fetched) {
    StorageView.renderLoadingUI(listContainer);
    StorageModule.fetchStock().then(data => {
      if (data && data.success) {
        if (typeof renderStorageList === 'function') renderStorageList(StorageModule.getSnapshot().stocks, typeof tier1Cache !== 'undefined' ? tier1Cache : null);
      } else if (data === null) {
        if (typeof renderStorageList === 'function') renderStorageList(StorageModule.getSnapshot().stocks, typeof tier1Cache !== 'undefined' ? tier1Cache : null);
      } else {
        StorageView.renderFetchFailedUI(listContainer);
      }
    }).catch(err => {
      StorageView.renderErrorUI(listContainer);
    });
  } else {
    if (typeof renderStorageList === 'function') renderStorageList(snapshot.stocks, typeof tier1Cache !== 'undefined' ? tier1Cache : null);
  }
}

// 在庫登録フォームの処理
window.submitFlyerStock = async function() {
  const locSelect = $('storage-register-location');
  const countInput = $('storage-register-count');
  const btn = $('btn-storage-register-submit');

  if (!locSelect || !countInput || !btn) return;

  const location = locSelect.value;
  const count = parseInt(String(countInput.value).replace(/,/g, '').replace(/枚/g, ''), 10);

  if (!location) {
    alert("保管場所を選択してください。");
    return;
  }
  if (isNaN(count) || count < 0) {
    alert("正しい枚数を入力してください。");
    return;
  }

  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffId = userInfo.id || '';
  const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim();

  if (!staffId || !staffName) {
    alert("ID情報がありません。ID登録を行ってください。");
    return;
  }

  btn.disabled = true;
  btn.textContent = "更新中...";

  try {
    await waitForIdentityVerified();
  } catch (authErr) {
    alert("本人確認が完了していないか、未登録のため更新できません。");
    btn.disabled = false;
    btn.textContent = "チラシ枚数を更新";
    return;
  }

  try {
    const res = await StorageModule.updateStock({
      location: location,
      count: count,
      staffName: staffName,
      staffId: staffId
    });

    if (res && res.success) {
      alert("✓ チラシ枚数を更新しました");
      if (countInput) delete countInput.dataset.userEditing;
      if (locSelect) delete locSelect.dataset.userSelected;
    } else {
      alert("更新に失敗しました: " + (res.message || "エラー"));
    }
  } catch (e) {
    alert("エラーが発生しました: " + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (typeof StorageView !== 'undefined' && typeof StorageView.updateRegisterButtonText === 'function') {
        StorageView.updateRegisterButtonText();
      } else {
        btn.textContent = "チラシ枚数を更新する";
      }
    }
  }
};



let lastSummaryData = null;

/**
 * updateStats(summaryData) - 表示専用関数 (SystemSummaryService / AddressMasterService 参照)
 */
function updateStats(summaryData = null) {
  const countEl = $('header-count');
  const pctEl = $('header-pct');

  if (summaryData) {
    lastSummaryData = summaryData;
  } else {
    summaryData = lastSummaryData;
  }

  if (!summaryData) {
    if (countEl) countEl.textContent = '( -- / -- )';
    if (pctEl) pctEl.textContent = '--%';
    return;
  }

  // data/address_master.csv の件数を総エリア数 (total) のSSOTとして使用
  let total = 0;
  if (typeof AddressMasterService !== 'undefined' && AddressMasterService.getInstance) {
    const masterCache = AddressMasterService.getInstance().cache;
    if (masterCache && Array.isArray(masterCache) && masterCache.length > 0) {
      total = masterCache.length;
    }
  }

  const done = typeof summaryData.done === 'number' ? summaryData.done : 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  if (summaryData.districtName) {
    window.__districtName = summaryData.districtName;
    document.title = "POSTING MAP";
  }

  if (countEl) countEl.textContent = `( ${done} / ${total} )`;
  if (pctEl) pctEl.textContent = `${percent}%`;

  // AddressMasterServiceが未ロードの場合は非同期取得後に自動再反映
  if (total === 0 && typeof AddressMasterService !== 'undefined' && AddressMasterService.getInstance) {
    AddressMasterService.getInstance().getAll().then(master => {
      if (master && master.length > 0 && lastSummaryData) {
        updateStats(lastSummaryData);
      }
    }).catch(() => {});
  }
}

let _systemSummaryPromise = null;

async function fetchSystemSummary(forceRefresh = false) {
  if (_systemSummaryPromise && !forceRefresh) {
    return _systemSummaryPromise;
  }

  _systemSummaryPromise = (async () => {
    try {
      const res = await callApiPost('getSystemSummary');
      if (res && (res.code === 'CONTRACT_EXPIRED' || res.contractStatus === 'EXPIRED' || res.isExpired === true)) {
        window.__contractExpired = true;
        if (typeof setSyncStatus === 'function') setSyncStatus('offline');
        const statusEl = $('loading-status');
        if (statusEl) statusEl.textContent = '接続エラー: 接続できません。';
        const appEl = $('app');
        if (appEl) { appEl.classList.add('hidden'); appEl.classList.add('opacity-0'); }
        const loadingEl = $('loading');
        if (loadingEl) { loadingEl.classList.remove('hidden'); loadingEl.classList.remove('opacity-0'); }
        return res;
      }
      if (res && res.success) {
        updateStats(res);
        return res;
      }
    } catch (err) {
      console.warn("fetchSystemSummary failed:", err);
      if (err && (err.code === 'CONTRACT_EXPIRED' || err.contractStatus === 'EXPIRED' || err.isExpired === true)) {
        window.__contractExpired = true;
        if (typeof setSyncStatus === 'function') setSyncStatus('offline');
        const appEl = $('app');
        if (appEl) { appEl.classList.add('hidden'); appEl.classList.add('opacity-0'); }
        const loadingEl = $('loading');
        if (loadingEl) { loadingEl.classList.remove('hidden'); loadingEl.classList.remove('opacity-0'); }
        const statusEl = $('loading-status');
        if (statusEl) {
          statusEl.textContent = '契約期間が終了しているため利用できません。';
          statusEl.onclick = null;
          statusEl.style.cursor = 'default';
        }
      }
    }
    _systemSummaryPromise = null;
    return null;
  })();

  return _systemSummaryPromise;
}

/**
 * fetchTier1() - Tier 1 市町村サマリー取得
 */
let tier1Cache = null;

async function fetchTier1() {
  try {
    const cities = await AddressMasterService.getInstance().getCities();

    if (cities && cities.length > 0) {
      tier1Cache = cities;

      if (typeof StorageView !== 'undefined' && typeof StorageView.updateLocationDropdown === 'function') {
        StorageView.updateLocationDropdown(StorageModule.getSnapshot().locations, null, tier1Cache);
      }

      if (typeof renderAreas === 'function') {
        renderAreas();
      }

      if (lastSummaryData) {
        updateStats(lastSummaryData);
      }

      return tier1Cache;
    }
  } catch (err) {
    console.warn("fetchTier1 failed:", err);
  }

  return null;
}


async function safeInitApp() {
  // LIFF SDK が内部でトークン交換用に生成する非表示 iframe 内での二重実行（アクセストークン失効）を完全に防止するガード
  if (window !== window.top) {
    console.log("[DEBUG] Running inside iframe, skipping safeInitApp.");
    return;
  }

  logDebug("safeInitApp invoked.");
  console.log("POSTING MAP PRO safeInitApp started.");

  // URLに死んだパラメータが残っている、かつ初期化前（または失敗時）の保険
  const urlParams = new URLSearchParams(window.location.search);
  const hasOAuthParams = urlParams.has('code') || urlParams.has('liff.state');
  const isReturningFromLogin = sessionStorage.getItem('liff_initializing') === 'true';

  // liff.login()で戻ってきた場合（?code= あり & フラグあり）→ LIFFに正常処理させる
  // 孤立した ?code=（フラグなし）→ クリーンURLでやり直し（スタック防止）
  if (hasOAuthParams && !isReturningFromLogin) {
      sessionStorage.setItem('liff_initializing', 'true');
      window.location.href = window.location.origin + window.location.pathname;
      return;
  }
  // ※ フラグはここでは削除しない。ログイン確認成功後（isLoggedIn()=true）に削除する。

  // クライアント設定(PMS_CLIENT_CONFIG)からLIFF IDを取得、なければホスト名からフォールバック
  const liffId = (window.PMS_CLIENT_CONFIG && window.PMS_CLIENT_CONFIG.line && window.PMS_CLIENT_CONFIG.line.liffId);
  if (!liffId) {
    throw new Error("LIFF ID missing in client configuration.");
  }

  const existingUserInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const hasExistingStaffId = existingUserInfo.id && String(existingUserInfo.id).trim() !== '';

  // 【Optimistic First Paint】既存 user_info.id がある場合は LIFF / Identity API を待たずに即時先行表示！
  if (hasExistingStaffId) {
    logDebug("Optimistic First Paint: existing staffId found. Launching main app immediately.");
    if (typeof renderSettings === 'function') {
      renderSettings();
    }
    updateBottomNavVisibility();
    showMainApp();
  }

  startApp();

  if (typeof liff !== 'undefined') {
    try {
      logDebug("LIFF INIT START");
      await new Promise(r => setTimeout(r, 50));

      const liffInitPromise = liff.init({ liffId: liffId });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("LINEログインの応答がタイムアウトしました(5秒)")), 5000)
      );

      await Promise.race([liffInitPromise, timeoutPromise]);
      logDebug("LIFF INIT OK");
      setLoadingProgress(35, 'AUTHENTICATED');

      logDebug("LOGIN CHECK");
      if (liff.isLoggedIn()) {
        logDebug("LOGIN OK");
        sessionStorage.removeItem('liff_initializing');

        const currentToken = typeof getLiffAuthToken === 'function' ? getLiffAuthToken() : null;
        if (typeof currentToken === 'string' && currentToken.trim().length > 0) {
          _liffAuthState = 'READY';
          if (typeof _liffAuthReadyResolver === 'function') {
            _liffAuthReadyResolver(true);
          }
        } else {
          _liffAuthState = 'FAILED';
          const tokenErr = new Error("LIFF_TOKEN_MISSING");
          tokenErr.code = "UNAUTHORIZED";
          tokenErr.errorType = "PERMANENT";
          tokenErr.retryable = false;
          _liffAuthError = tokenErr;
          if (typeof _liffAuthReadyRejecter === 'function') {
            _liffAuthReadyRejecter(tokenErr);
          }
        }

        // ★ MASTER指示 ①: fetchSystemSummary() は liff.isLoggedIn() 成立直後、await liff.getProfile() より前に非同期発火すること。HeaderをProfile取得に依存させない。
        fetchSystemSummary();

        try {
          logDebug("PROFILE START");
          const profile = await liff.getProfile();
          logDebug("PROFILE OK");
          // 再試行で確実に使用できるよう早期確保
          window.liffProfile = profile;

          try {
            const cleanUrl = window.location.origin + window.location.pathname + window.location.search.replace(/[\?&](code|liff\.state)=[^&]*/g, '');
            window.history.replaceState({}, document.title, cleanUrl);
            logDebug("OAuth query parameters cleaned from address bar via history.replaceState (Safe Delay)");
          } catch (e) {
            console.warn("Failed to clean OAuth query parameters:", e);
          }

          if (!hasExistingStaffId) {
            // 初回・未登録端末: 従来どおり Identity 検証または登録完了までローディングを維持
            setLoadingProgress(50, 'VERIFYING IDENTITY...');
          }

          // 【Backend Identity 非同期同期】getStaffIdentity をバックグラウンド Promise で実行
          _identityLastError = null;
          _identitySyncPromise = callApiPost('getStaffIdentity', {})
            .then(identityRes => {
              if (identityRes && identityRes.success && identityRes.registered && identityRes.staffId && String(identityRes.staffId).trim() !== '') {
                // ① 登録済み: Backend の検証済み Identity を正として localStorage へ同期（lineUserId は保存しない）
                logDebug("STAFF IDENTITY VERIFIED (BG): " + identityRes.staffId);
                const verifiedUserInfo = {
                  last: identityRes.staffName || profile.displayName || '',
                  first: '',
                  id: identityRes.staffId,
                  picture: profile.pictureUrl || ''
                };
                localStorage.setItem('user_info', JSON.stringify(verifiedUserInfo));
                _identityVerified = true;
                _identityLastError = null;

                if (typeof renderSettings === 'function') {
                  renderSettings();
                }
                updateBottomNavVisibility();

                // Identity確定に伴う未送信Queue Flush再発火
                if (typeof processQueue === 'function') {
                  processQueue();
                }

                // 初回起動ユーザーの場合はここで画面を表示
                if (!hasExistingStaffId) {
                  setLoadingProgress(100, 'READY');
                  showMainApp();
                }
                return true;
              } else {
                // ② 未登録または不一致: キャッシュを無効化し、初回登録フローへ
                logDebug("STAFF NOT REGISTERED OR IDENTITY MISMATCH. PROCEEDING TO REGISTRATION...");
                _identityVerified = false;

                const initialUserInfo = {
                  last: profile.displayName || '',
                  first: '',
                  id: '',
                  picture: profile.pictureUrl || ''
                };
                localStorage.setItem('user_info', JSON.stringify(initialUserInfo));

                // 既存表示していた場合でも未登録なら画面を戻して登録完了までロック
                mainAppVisible = false;
                $('app').classList.add('hidden');
                $('app').classList.add('opacity-0');
                const loadingEl = $('loading');
                if (loadingEl) { loadingEl.classList.remove('hidden'); loadingEl.classList.remove('opacity-0'); }
                setLoadingProgress(60, 'REGISTERING...');

                return triggerBackgroundRegistration(profile).then(() => {
                  const verifiedInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
                  if (!verifiedInfo.id) {
                    throw new Error("Registration finished but staffId is missing in storage");
                  }
                  _identityVerified = true;
                  _identityLastError = null;

                  // 登録完了に伴う未送信Queue Flush再発火
                  if (typeof processQueue === 'function') {
                    processQueue();
                  }

                  setLoadingProgress(100, 'READY');
                  showMainApp();
                  return true;
                }).catch(rErr => {
                  _identityVerified = false;
                  _identityLastError = rErr;
                  logDebug("Registration halted: " + (rErr ? rErr.message : rErr));
                  throw rErr;
                });
              }
            })
            .catch(err => {
              console.warn("Identity verification failed:", err);
              logDebug("Identity verification failed: " + err.message);
              _identityVerified = false;
              _identityLastError = err;
              showIdentityErrorUI(err);
              return false;
            });

          // 初回起動時のみ、非同期 Promise の完了を待ってから抜ける
          if (!hasExistingStaffId) {
            await _identitySyncPromise;
            if (!_identityVerified) {
              return;
            }
          }
        } catch (err) {
          console.error("LIFF PROFILE / AUTH ERROR", err);
          logDebug("LIFF PROFILE / AUTH ERROR: " + err.message);

          if (err.message && err.message.toUpperCase().includes("REVOKED")) {
            logDebug("Access token revoked detected. Routing to standard UNAUTHORIZED flow...");
            err.code = 'UNAUTHORIZED';
            err.errorType = 'PERMANENT';
            err.retryable = false;
            showIdentityErrorUI(err);
            return;
          }

          showIdentityErrorUI(err);
        }
      } else {
        // LINEログイン処理中（OAuthコールバックのパラメータがある）なら、手動ログイン画面を出さずに少し待機して再チェックする
        const urlParams = new URLSearchParams(window.location.search);
        const isProcessing = urlParams.has('code') || urlParams.has('liff.state');
        if (isProcessing) {
          logDebug("LINE login is processing in background. Retrying login check in 1.5s...");
          setTimeout(() => {
            if (liff.isLoggedIn()) {
              logDebug("Retried Login: OK");
              safeInitApp(); // 再起動してメインフローへ入る
            } else {
              logDebug("Retried Login: FAIL. Redirecting to LINE Login automatically...");
              sessionStorage.setItem('liff_initializing', 'true');
              liff.login();
            }
          }, 1500);
          return;
        }

        logDebug("Not logged in. Redirecting to LINE Login automatically...");
        sessionStorage.setItem('liff_initializing', 'true');
        liff.login();
      }
    } catch (err) {
      console.error("LIFF Init Error:", err);
      logDebug("LIFF Error: " + err.message);
      _liffAuthState = 'FAILED';
      _liffAuthError = err;
      if (typeof _liffAuthReadyRejecter === 'function') {
        _liffAuthReadyRejecter(err);
      }
      showIdentityErrorUI(err);
    }
  } else {
    logDebug("Running in standalone web browser. Blocked.");
    const standaloneErr = new Error("STANDALONE_BROWSER_NOT_SUPPORTED");
    standaloneErr.code = "UNAUTHORIZED";
    standaloneErr.errorType = "PERMANENT";
    standaloneErr.retryable = false;
    _liffAuthState = 'FAILED';
    _liffAuthError = standaloneErr;
    if (typeof _liffAuthReadyRejecter === 'function') {
      _liffAuthReadyRejecter(standaloneErr);
    }
    $('loading-status').textContent = "エラー: LINEアプリ内から起動してください。";
  }
}

function showIdentityErrorUI(err) {
  mainAppVisible = false;
  const appEl = $('app');
  if (appEl) {
    appEl.classList.add('hidden');
    appEl.classList.add('opacity-0');
  }
  const loadingEl = $('loading');
  if (loadingEl) {
    loadingEl.classList.remove('hidden');
    loadingEl.classList.remove('opacity-0');
  }

  const statusEl = $('loading-status');
  if (!statusEl) return;

  // 1. CONTRACT_EXPIRED: App遮断、再試行なし
  if (err && (err.code === 'CONTRACT_EXPIRED' || err.contractStatus === 'EXPIRED' || err.isExpired === true)) {
    window.__contractExpired = true;
    if (typeof setSyncStatus === 'function') setSyncStatus('offline');
    statusEl.textContent = "契約期間が終了しているため利用できません。";
    statusEl.onclick = null;
    statusEl.style.cursor = 'default';
    return;
  }

  // 2. UNAUTHORIZED / token失効: App遮断、LINE再ログイン
  if (err && err.code === 'UNAUTHORIZED') {
    statusEl.textContent = "認証エラー: LINEログインの有効期限が切れました。\n(タップして再ログイン)";
    statusEl.style.cursor = 'pointer';
    statusEl.onclick = function() {
      statusEl.onclick = null;
      statusEl.style.cursor = 'default';
      // Safe Delay OAuth復帰フラグを必ずlogin前に設定
      sessionStorage.setItem('liff_initializing', 'true');
      const liffObj = typeof liff !== 'undefined' ? liff : (typeof window !== 'undefined' ? window.liff : null);
      if (liffObj && liffObj.logout && liffObj.login) {
        try { liffObj.logout(); } catch(e) {}
        liffObj.login({ redirectUri: window.location.href });
      } else {
        window.location.reload();
      }
    };
    return;
  }

  // 3. LIFF init timeout / init reject / FAILED: App遮断、「タップして再接続」でページreload
  const isLiffInitFailure = _liffAuthState === 'FAILED' || (err && (err.isLiffInitError || (err.message && err.message.includes('LINEログインの応答がタイムアウト'))));
  if (isLiffInitFailure) {
    let msg = "接続エラー: ";
    msg += (err ? err.message : "LINE初期化に失敗しました") + "\n(タップして再接続)";
    statusEl.textContent = msg;
    statusEl.style.cursor = 'pointer';
    statusEl.onclick = function() {
      statusEl.onclick = null;
      statusEl.style.cursor = 'default';
      window.location.reload();
    };
    return;
  }

  // 4. Identity API の TRANSIENT / 通信エラー: App遮断、retryIdentityVerification()
  let msg = "初期化エラー: ";
  msg += (err ? (err.message || err.code) : "通信エラー") + "\n(タップして再試行)";
  statusEl.textContent = msg;
  statusEl.style.cursor = 'pointer';
  statusEl.onclick = function() {
    statusEl.onclick = null;
    statusEl.style.cursor = 'default';
    window.retryIdentityVerification();
  };
}

window.retryIdentityVerification = function() {
  const statusEl = $('loading-status');
  if (statusEl) {
    statusEl.onclick = null;
    statusEl.style.cursor = 'default';
    statusEl.textContent = "アカウント照合を再試行中...";
  }

  const profile = window.liffProfile || (typeof liff !== 'undefined' && liff.getDecodedIDToken ? {
    displayName: liff.getDecodedIDToken()?.name || '',
    userId: liff.getDecodedIDToken()?.sub || '',
    pictureUrl: liff.getDecodedIDToken()?.picture || ''
  } : null);

  // 新規 Promise を生成して再試行（reject済みの古いPromiseは再利用しない）
  _identityLastError = null;
  _identitySyncPromise = callApiPost('getStaffIdentity', {})
    .then(identityRes => {
      if (identityRes && identityRes.success && identityRes.registered && identityRes.staffId && String(identityRes.staffId).trim() !== '') {
        logDebug("RETRY STAFF IDENTITY VERIFIED: " + identityRes.staffId);
        const verifiedUserInfo = {
          last: identityRes.staffName || (profile ? profile.displayName : '') || '',
          first: '',
          id: identityRes.staffId,
          picture: (profile ? profile.pictureUrl : '') || ''
        };
        localStorage.setItem('user_info', JSON.stringify(verifiedUserInfo));
        _identityVerified = true;
        _identityLastError = null;
        if (typeof renderSettings === 'function') renderSettings();
        updateBottomNavVisibility();
        if (typeof processQueue === 'function') processQueue();
        setLoadingProgress(100, 'READY');
        showMainApp();
        return true;
      } else {
        // 未登録分岐の完結: registerStaff -> 成功 -> staffId確認 -> Verified -> Queue flush -> READY -> showMainApp
        logDebug("RETRY STAFF NOT REGISTERED. PROCEEDING TO REGISTRATION...");
        _identityVerified = false;
        return triggerBackgroundRegistration(profile).then(() => {
          const verifiedInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
          if (!verifiedInfo.id) {
            throw new Error("Registration finished but staffId is missing in storage");
          }
          _identityVerified = true;
          _identityLastError = null;
          if (typeof processQueue === 'function') processQueue();
          setLoadingProgress(100, 'READY');
          showMainApp();
          return true;
        });
      }
    })
    .catch(err => {
      console.warn("Retry identity verification failed:", err);
      _identityVerified = false;
      _identityLastError = err;
      showIdentityErrorUI(err);
      return false;
    });
};

if (document.readyState === 'complete') {
  safeInitApp();
} else {
  window.addEventListener('DOMContentLoaded', safeInitApp);
}

// 規約・ライセンスデータ
const ID_INFO_DATA = {
  terms: {
    title: 'Terms of Service',
    body: `
      <div class="space-y-4 text-[11px] leading-relaxed text-white/50 select-none">
        <p>POSTING MAP は、<br>認証された配布員・管理者向けの<br><span class="text-white font-bold">FIELD OPERATIONS SYSTEM</span> です。</p>

        <div class="space-y-1">
          <p class="text-white/70 font-black">本システムは：</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・配布進捗</div>
            <div>・エリア管理</div>
            <div>・GPSログ</div>
            <div>・活動データ</div>
            <div>・ランキング</div>
          </div>
          <p class="text-white/40">をリアルタイム管理します。</p>
        </div>

        <div class="space-y-1">
          <p class="text-white/70 font-black">本システムの：</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・無断複製</div>
            <div>・再配布</div>
            <div>・不正利用</div>
            <div>・地域外利用</div>
          </div>
          <p class="text-white/40">を禁止します。</p>
        </div>

        <p class="text-white/40 pt-2 border-t border-white/5">各地域ライセンスは、<br>契約支部・契約組織にのみ付与されます。</p>
      </div>
    `
  },
  privacy: {
    title: 'Privacy Policy',
    body: `
      <div class="space-y-4 text-[11px] leading-relaxed text-white/50 select-none">
        <p>POSTING MAP は、<br>FIELD OPERATIONS SYSTEM として、<br>以下の情報を取得・管理します。</p>

        <div class="space-y-1">
          <p class="text-white/70 font-black">【取得・管理する情報】</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・LINE認証情報</div>
            <div>・配布員ID</div>
            <div>・エリア進捗</div>
            <div>・配布ログ</div>
            <div>・GPS位置情報</div>
            <div>・写真エビデンス</div>
            <div>・デバイス情報</div>
          </div>
        </div>

        <div class="space-y-1">
          <p class="text-white/70 font-black">【取得データの利用目的】</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・配布進捗管理</div>
            <div>・エリア統制</div>
            <div>・FIELD OPERATIONS分析</div>
            <div>・不正防止</div>
            <div>・リアルタイム同期</div>
          </div>
        </div>

        <p class="text-white/40 pt-2 border-t border-white/5">GPSおよび写真情報は、<br>FIELD OPERATIONS の活動証跡として利用されます。</p>
      </div>
    `
  },
  license: {
    title: 'License',
    body: `
      <div class="space-y-4 text-[11px] leading-relaxed text-white/50 select-none">
        <p class="text-white font-bold">FIELD OPERATIONS LICENSE</p>

        <p class="text-white/60 font-black">LICENSED ORGANIZATION<br>【__BRANCH_NAME__】</p>

        <div class="space-y-1">
          <p class="text-white/70 font-black">AUTHORIZED SYSTEMS：</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・STAFF APP</div>
            <div>・ADMIN CONTROL</div>
            <div>・HQ MONITORING</div>
            <div>・REALTIME FIELD SYNC</div>
          </div>
        </div>

        <p class="text-white/60 font-black">LICENSE STATUS:<br><span class="text-emerald-500/80 font-black">ACTIVE</span></p>

        <p class="text-white/40">本ライセンスは、契約地域内のみ有効です。<br>地域外利用・再配布は禁止します。</p>

        <div class="space-y-1">
          <p class="text-white/70 font-black">POSTING MAP は：</p>
          <div class="pl-3 text-white/40 space-y-0.5">
            <div>・LINE認証</div>
            <div>・STAFF ID</div>
            <div>・ライセンス管理</div>
            <div>・権限制御</div>
          </div>
          <p class="text-white/40">により、FIELD OPERATIONS を保護します。</p>
        </div>

        <p class="text-white/40 pt-2 border-t border-white/5">LICENSED FIELD OPERATIONS SYSTEM<br>© POSTING MAP</p>
      </div>
    `
  }
};

// ID情報モーダルの制御
function openIdInfoModal(type, event) {
  if (event) event.stopPropagation(); // イベントのバブリング防止

  const modal = $('id-info-modal');
  if (!modal) return;

  const data = ID_INFO_DATA[type];
  if (!data) return;

  const titleEl = $('id-info-title');
  const bodyEl = $('id-info-body');

  if (titleEl) titleEl.textContent = data.title;
  if (bodyEl) {
    let bodyText = data.body;

    // ライセンス表示時のみ、地区名を動的に差し替える（Google Sheetsファイル名SSOTから動的解決）
    if (type === 'license') {
      const displayBranch = window.__districtName || localStorage.getItem('branch_name') || '';
      bodyText = bodyText.replace('__BRANCH_NAME__', escapeHtml(displayBranch));
    }

    bodyEl.innerHTML = bodyText;
  }

  modal.classList.remove('pointer-events-none', 'opacity-0');
  modal.firstElementChild.classList.remove('translate-y-full');
}

function closeIdInfoModal() {
  const modal = $('id-info-modal');
  if (!modal) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.firstElementChild.classList.add('translate-y-full');
}

// =============================
// 受渡要請システム (Flyer Transfer Request System)
// =============================
let currentTransferRequest = null;

window.openTransferRequestDialog = function(name, id, loc, count, storageId) {
  const displayStorageId = String(storageId || '').trim();
  currentTransferRequest = { holderName: name, holderUserId: id, requestArea: loc, stockCount: count, storageId: displayStorageId };

  // 既存を削除して再生成（CSS競合を完全排除）
  const prev = document.getElementById('dynamic-transfer-dialog');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dynamic-transfer-dialog';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.85);';

  overlay.innerHTML = `
    <div style="background:#1C1C1E;border-radius:24px;border:1px solid rgba(255,255,255,0.12);padding:28px 20px;width:100%;max-width:340px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:24px;margin-bottom:8px;">📦</div>
        <div style="color:white;font-size:16px;font-weight:900;letter-spacing:0.05em;">受渡要請</div>
      </div>
      <div style="color:rgba(255,255,255,0.7);font-size:13px;font-weight:700;margin-bottom:20px;line-height:1.5;text-align:left;">
        ${escapeHtml(displayStorageId)}さんとの<br>連絡方法を入力してください。
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block;color:rgba(255,255,255,0.45);font-size:11px;font-weight:900;letter-spacing:0.05em;margin-bottom:8px;">【連絡方法】</label>
        <div style="display:flex;gap:16px;align-items:center;padding:4px 0;">
          <label style="display:flex;align-items:center;gap:6px;color:white;font-size:13px;font-weight:700;cursor:pointer;">
            <input type="radio" name="contact-method" value="LINE" checked style="accent-color:#2563eb;cursor:pointer;"> LINE
          </label>
          <label style="display:flex;align-items:center;gap:6px;color:white;font-size:13px;font-weight:700;cursor:pointer;">
            <input type="radio" name="contact-method" value="電話" style="accent-color:#2563eb;cursor:pointer;"> 電話
          </label>
          <label style="display:flex;align-items:center;gap:6px;color:white;font-size:13px;font-weight:700;cursor:pointer;">
            <input type="radio" name="contact-method" value="メール" style="accent-color:#2563eb;cursor:pointer;"> メール
          </label>
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <label style="display:block;color:rgba(255,255,255,0.45);font-size:11px;font-weight:900;letter-spacing:0.05em;margin-bottom:8px;">【連絡先】</label>
        <input type="text" id="transfer-contact-value" placeholder="LINE ID"
          style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:12px 14px;color:white;font-size:14px;font-weight:700;outline:none;" />
      </div>

      <div style="display:flex;gap:10px;">
        <button id="dyn-cancel"
          style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:14px;padding:14px 8px;font-size:13px;font-weight:900;cursor:pointer;transition:transform 0.12s ease, opacity 0.12s ease;"
          onpointerdown="this.style.transform='scale(0.94)'; this.style.opacity='0.7';"
          onpointerup="this.style.transform='scale(1)'; this.style.opacity='1';"
          onpointerleave="this.style.transform='scale(1)'; this.style.opacity='1';">キャンセル</button>
        <button id="dyn-submit" class="btn-neu"
          style="flex:2;background:#2563eb;border:none;color:white;border-radius:14px;padding:14px 8px;font-size:13px;font-weight:900;cursor:pointer;transition:transform 0.12s ease, opacity 0.12s ease;"
          onpointerdown="this.style.transform='scale(0.96)'; this.style.opacity='0.85';"
          onpointerup="this.style.transform='scale(1)'; this.style.opacity='1';"
          onpointerleave="this.style.transform='scale(1)'; this.style.opacity='1';">受渡要請を送る</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const contactValueInput = document.getElementById('transfer-contact-value');
  const methodPlaceholders = {
    'LINE': 'LINE ID',
    '電話': '電話番号',
    'メール': 'メールアドレス'
  };

  document.querySelectorAll('input[name="contact-method"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (contactValueInput) {
        contactValueInput.placeholder = methodPlaceholders[e.target.value] || '連絡先を入力';
      }
    });
  });

  document.getElementById('dyn-cancel').addEventListener('click', () => overlay.remove());

  let isSubmittingTransfer = false;
  document.getElementById('dyn-submit').addEventListener('click', async () => {
    if (isSubmittingTransfer) return;

    const contactValueInput = document.getElementById('transfer-contact-value');
    const contactValue = contactValueInput ? contactValueInput.value.trim() : '';

    if (!contactValue) {
      alert('連絡先を入力してください。');
      if (contactValueInput) contactValueInput.focus();
      return;
    }

    const methodRadio = document.querySelector('input[name="contact-method"]:checked');
    const contactMethod = methodRadio ? methodRadio.value : 'LINE';

    const btn = document.getElementById('dyn-submit');
    if (btn) { btn.textContent = '送信中...'; btn.disabled = true; }
    isSubmittingTransfer = true;

    try {
      await waitForIdentityVerified();
    } catch (authErr) {
      alert("本人確認が完了していないため要請を送信できません。");
      if (btn) { btn.textContent = '要請を送信する'; btn.disabled = false; }
      isSubmittingTransfer = false;
      return;
    }

    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const requestUserId = userInfo.id ? String(userInfo.id).trim() : 'UNKNOWN';
    const requestId = window.generateRequestId ? window.generateRequestId('req_tr') : `req_tr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await callApiPost('requestFlyerTransfer', {
        requestId: requestId,
        requestUserId: requestUserId,
        holderUserId: currentTransferRequest.holderUserId,
        storageId: currentTransferRequest.storageId || '',
        contactMethod: contactMethod,
        contactValue: contactValue
      });

      overlay.remove();
      if (res && (res.status === 'SENT' || res.status === 'SKIPPED_NO_LINE_ID')) {
        alert('✅ 受渡要請を送信しました！\n保管者に通知されます。');
      } else if (res && res.status === 'UNKNOWN') {
        alert('⚠️ 送信結果を確認できませんでした。\n通信状態をご確認のうえ、二重送信を防ぐためしばらくお待ちください。');
      } else {
        alert('送信に失敗しました: ' + (res ? res.message : 'Unknown error'));
      }
    } catch(err) {
      alert('通信エラー: ' + err.message);
      isSubmittingTransfer = false;
      if (btn) { btn.textContent = '受渡要請を送る'; btn.disabled = false; }
    }
  });
};

window.closeTransferRequestDialog = function() {
  const d = document.getElementById('dynamic-transfer-dialog');
  if (d) d.remove();
};

window.updateBulletinCharCount = function(textarea) {
  const counter = document.getElementById('bulletin-char-counter');
  if (!counter || !textarea) return;
  const len = textarea.value.length;
  counter.textContent = len + ' / 150';
  if (len >= 150) {
    counter.classList.add('text-red-400');
    counter.classList.remove('text-white/40');
  } else {
    counter.classList.remove('text-red-400');
    counter.classList.add('text-white/40');
  }
};

window.fetchBulletinPosts = function(options = {}) {
  if (typeof BulletinModule === 'undefined') {
    console.error("[Bulletin Error] BulletinModule is not loaded.");
    return Promise.reject(new Error("BulletinModule unavailable"));
  }

  const hooks = {
    isPageActive: () => {
      const page = document.getElementById('page-bulletin');
      return !!(page && !page.classList.contains('hidden'));
    },
    onLoading: () => {
      if (typeof BulletinView !== 'undefined' && BulletinView.showLoading) {
        BulletinView.showLoading();
      }
    },
    onRender: (posts) => {
      if (typeof BulletinView !== 'undefined' && BulletinView.renderPosts) {
        BulletinView.renderPosts(posts);
      } else if (typeof renderBulletinList === 'function') {
        renderBulletinList(posts);
      }
    },
    onError: (info) => {
      if (typeof BulletinView !== 'undefined' && BulletinView.showError) {
        BulletinView.showError(info);
      }
    }
  };

  return BulletinModule.fetchPosts(options, hooks);
};

window.submitBulletinPost = async function() {
  const inputEl = document.getElementById('bulletin-message-input');
  const btn = document.getElementById('btn-bulletin-submit');
  const counter = document.getElementById('bulletin-char-counter');
  if (!inputEl || !btn) return;

  const msg = inputEl.value;
  if (typeof BulletinModule === 'undefined') {
    alert('BulletinModuleが読み込まれていません。');
    return;
  }

  const valRes = BulletinModule.validateMessage(msg);
  if (!valRes.valid) {
    alert(valRes.message);
    if (valRes.error === 'EMPTY') inputEl.focus();
    return;
  }

  const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
  const staffId = userInfo.id ? String(userInfo.id).trim() : (window.currentUser && window.currentUser.id ? String(window.currentUser.id).trim() : '');
  const staffName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim() || staffId;

  if (!staffId) {
    alert('配布員IDが取得できませんでした。');
    return;
  }

  const originalText = btn.textContent;
  btn.textContent = '投稿中...';
  btn.disabled = true;

  try {
    await waitForIdentityVerified();
  } catch (authErr) {
    alert("本人確認が完了していないため投稿できません。");
    btn.textContent = originalText;
    btn.disabled = false;
    return;
  }

  try {
    const res = await BulletinModule.createPost({
      staffId: staffId,
      staffName: staffName,
      message: valRes.value
    });

    if (res && res.success) {
      inputEl.value = '';
      if (counter) counter.textContent = '0 / 150';
      alert('✓ 投稿が完了しました');
      // 投稿完了後：キャッシュを無視して最新取得を要求
      window.fetchBulletinPosts({ force: true });
    } else {
      alert('投稿に失敗しました: ' + (res ? res.message : 'Unknown error'));
    }
  } catch (err) {
    alert('通信エラー: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};


window.openBulletinContactDialog = function(targetStaffId) {
  const prev = document.getElementById('dynamic-bulletin-contact-dialog');
  if (prev) prev.remove();

  const targetIdStr = String(targetStaffId || '').trim();
  const overlay = document.createElement('div');
  overlay.id = 'dynamic-bulletin-contact-dialog';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,0.85);';

  overlay.innerHTML = `
    <div style="background:#1C1C1E;border-radius:24px;border:1px solid rgba(255,255,255,0.12);padding:28px 20px;width:100%;max-width:340px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:24px;margin-bottom:8px;">💬</div>
        <div style="color:white;font-size:16px;font-weight:900;letter-spacing:0.05em;">連絡</div>
      </div>
      <div style="color:rgba(255,255,255,0.7);font-size:13px;font-weight:700;margin-bottom:20px;line-height:1.5;text-align:left;">
        ${escapeHtml(targetIdStr)}さんとの<br>連絡方法を入力してください。
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block;color:rgba(255,255,255,0.45);font-size:11px;font-weight:900;letter-spacing:0.05em;margin-bottom:8px;">【連絡方法】</label>
        <div style="display:flex;gap:16px;align-items:center;padding:4px 0;">
          <label style="display:flex;align-items:center;gap:6px;color:white;font-size:13px;font-weight:700;cursor:pointer;">
            <input type="radio" name="bulletin-contact-method" value="LINE" checked style="accent-color:#2563eb;cursor:pointer;"> LINE
          </label>
          <label style="display:flex;align-items:center;gap:6px;color:white;font-size:13px;font-weight:700;cursor:pointer;">
            <input type="radio" name="bulletin-contact-method" value="電話" style="accent-color:#2563eb;cursor:pointer;"> 電話
          </label>
          <label style="display:flex;align-items:center;gap:6px;color:white;font-size:13px;font-weight:700;cursor:pointer;">
            <input type="radio" name="bulletin-contact-method" value="メール" style="accent-color:#2563eb;cursor:pointer;"> メール
          </label>
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <label style="display:block;color:rgba(255,255,255,0.45);font-size:11px;font-weight:900;letter-spacing:0.05em;margin-bottom:8px;">【連絡先】</label>
        <input type="text" id="bulletin-contact-value" placeholder="LINE ID"
          style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:12px 14px;color:white;font-size:14px;font-weight:700;outline:none;" />
      </div>

      <div style="display:flex;gap:10px;">
        <button id="btn-bulletin-contact-cancel"
          style="flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:14px;padding:14px 8px;font-size:13px;font-weight:900;cursor:pointer;transition:transform 0.12s ease, opacity 0.12s ease;"
          onpointerdown="this.style.transform='scale(0.94)'; this.style.opacity='0.7';"
          onpointerup="this.style.transform='scale(1)'; this.style.opacity='1';"
          onpointerleave="this.style.transform='scale(1)'; this.style.opacity='1';">キャンセル</button>
        <button id="btn-bulletin-contact-submit" class="btn-neu"
          style="flex:2;background:#2563eb;border:none;color:white;border-radius:14px;padding:14px 8px;font-size:13px;font-weight:900;cursor:pointer;transition:transform 0.12s ease, opacity 0.12s ease;"
          onpointerdown="this.style.transform='scale(0.96)'; this.style.opacity='0.85';"
          onpointerup="this.style.transform='scale(1)'; this.style.opacity='1';"
          onpointerleave="this.style.transform='scale(1)'; this.style.opacity='1';">連絡する</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const contactValueInput = document.getElementById('bulletin-contact-value');
  const methodPlaceholders = {
    'LINE': 'LINE ID',
    '電話': '電話番号',
    'メール': 'メールアドレス'
  };

  document.querySelectorAll('input[name="bulletin-contact-method"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (contactValueInput) {
        contactValueInput.placeholder = methodPlaceholders[e.target.value] || '連絡先を入力';
      }
    });
  });

  document.getElementById('btn-bulletin-contact-cancel').addEventListener('click', () => overlay.remove());

  let isSubmittingContact = false;
  document.getElementById('btn-bulletin-contact-submit').addEventListener('click', async () => {
    if (isSubmittingContact) return;

    const contactValueInput = document.getElementById('bulletin-contact-value');
    const contactValue = contactValueInput ? contactValueInput.value.trim() : '';

    if (!contactValue) {
      alert('連絡先を入力してください。');
      if (contactValueInput) contactValueInput.focus();
      return;
    }

    const methodRadio = document.querySelector('input[name="bulletin-contact-method"]:checked');
    const contactMethod = methodRadio ? methodRadio.value : 'LINE';

    const btn = document.getElementById('btn-bulletin-contact-submit');
    if (btn) { btn.textContent = '連絡中...'; btn.disabled = true; }
    isSubmittingContact = true;

    try {
      await waitForIdentityVerified();
    } catch (authErr) {
      alert("本人確認が完了していないため連絡を送信できません。");
      if (btn) { btn.textContent = '連絡する'; btn.disabled = false; }
      isSubmittingContact = false;
      return;
    }

    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
    const requestUserId = userInfo.id ? String(userInfo.id).trim() : (window.currentUser && window.currentUser.id ? String(window.currentUser.id).trim() : 'UNKNOWN');
    const requestId = window.generateRequestId ? window.generateRequestId('req_bc') : `req_bc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await callApiPost('sendBulletinContact', {
        requestId: requestId,
        requestUserId: requestUserId,
        targetStaffId: targetIdStr,
        contactMethod: contactMethod,
        contactValue: contactValue
      });

      overlay.remove();
      if (res && (res.status === 'SENT' || res.status === 'SKIPPED_NO_LINE_ID')) {
        alert('✓ 連絡を送信しました');
      } else if (res && res.status === 'UNKNOWN') {
        alert('⚠️ 送信結果を確認できませんでした。\n通信状態をご確認のうえ、二重送信を防ぐためしばらくお待ちください。');
      } else {
        alert('連絡の送信に失敗しました: ' + (res ? res.message : 'Unknown error'));
      }
    } catch(err) {
      alert('通信エラー: ' + err.message);
      isSubmittingContact = false;
      if (btn) { btn.textContent = '連絡する'; btn.disabled = false; }
    }
  });
};

window.closeBulletinContactDialog = function() {
  const d = document.getElementById('dynamic-bulletin-contact-dialog');
  if (d) d.remove();
};


