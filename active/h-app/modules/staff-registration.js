/**
 * POSTING MAP - Staff Registration Feature Module (modules/staff-registration.js)
 * 
 * 責務:
 * - スタッフ登録状態（isRegistering, registrationError, activeRegistrationPromise）の単一SSOT管理
 * - registerStaff API通信の実行とIn-flight重複防止
 * - 登録ライフサイクル（onStart, onSuccess, onError, onFinally）のフック発火
 * - UI/DOM非依存（DOMやStorageViewには一切触れず、結果をhooks経由でComposition Rootへ通知）
 */
const StaffRegistrationModule = (function() {
  let _isRegistering = false;
  let _registrationError = false;
  let _activeRegistrationPromise = null;

  function registerStaff(profile, hooks = {}) {
    if (_activeRegistrationPromise) {
      return _activeRegistrationPromise;
    }

    _isRegistering = true;
    _registrationError = false;

    if (typeof hooks.onStart === 'function') {
      try {
        hooks.onStart();
      } catch (e) {
        console.warn('[StaffRegistrationModule] onStart hook error:', e);
      }
    }

    const apiCaller = (hooks && typeof hooks.apiCaller === 'function')
      ? hooks.apiCaller
      : ((hooks && typeof hooks.callApiPost === 'function')
          ? hooks.callApiPost
          : (typeof callApiPost === 'function' ? callApiPost : null));

    if (typeof apiCaller !== 'function') {
      const missingErr = new Error("callApiPost is not available");
      _registrationError = true;
      _isRegistering = false;
      if (typeof hooks.onError === 'function') {
        try { hooks.onError(missingErr); } catch (e) {}
      }
      return Promise.reject(missingErr);
    }

    const logger = (hooks && typeof hooks.logDebug === 'function')
      ? hooks.logDebug
      : (typeof logDebug === 'function' ? logDebug : null);

    if (logger) {
      logger("API START (初回登録・非同期)");
    }

    const payload = {
      lastName: profile ? profile.displayName : '',
      firstName: "(LINE)",
      lineUserId: profile ? profile.userId : ''
    };

    _activeRegistrationPromise = apiCaller('registerStaff', payload).then(res => {
      if (logger) {
        logger("API OK (初回登録完了)");
      }

      if (res && res.success && res.id && String(res.id).trim() !== '') {
        if (typeof hooks.onSuccess === 'function') {
          hooks.onSuccess(res, profile);
        }
        return res;
      } else {
        const errMsg = (res && res.error) ? res.error : "GAS registration returned invalid response (missing id)";
        throw new Error(errMsg);
      }
    }).catch(err => {
      _registrationError = true;

      if (logger) {
        logger("Background registration failed: " + (err ? err.message : err));
      }

      if (typeof hooks.onError === 'function') {
        try {
          hooks.onError(err);
        } catch (hookErr) {
          console.warn('[StaffRegistrationModule] onError hook error:', hookErr);
        }
      }
      throw err;
    }).finally(() => {
      _isRegistering = false;
      _activeRegistrationPromise = null;

      if (typeof hooks.onFinally === 'function') {
        try {
          hooks.onFinally();
        } catch (finallyErr) {
          console.warn('[StaffRegistrationModule] onFinally hook error:', finallyErr);
        }
      }
    });

    return _activeRegistrationPromise;
  }

  function getStatus() {
    return {
      isRegistering: _isRegistering,
      registrationError: _registrationError
    };
  }

  function getSnapshot() {
    return {
      isRegistering: _isRegistering,
      registrationError: _registrationError,
      hasActivePromise: Boolean(_activeRegistrationPromise)
    };
  }

  function resetForTest() {
    _isRegistering = false;
    _registrationError = false;
    _activeRegistrationPromise = null;
  }

  return {
    registerStaff,
    getStatus,
    getSnapshot,
    resetForTest
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StaffRegistrationModule;
}
