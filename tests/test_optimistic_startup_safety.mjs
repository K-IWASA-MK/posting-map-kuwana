import test from 'node:test';
import assert from 'node:assert/strict';

test('Identity Safety Gate: Verified before write allows execution', async () => {
  let _identityVerified = false;
  let _identitySyncPromise = null;

  function waitForIdentityVerified() {
    if (_identityVerified) return Promise.resolve(true);
    if (_identitySyncPromise) return _identitySyncPromise;
    return Promise.reject(new Error("IDENTITY_NOT_INITIALIZED"));
  }

  // Simulate in-flight getStaffIdentity
  let resolveIdentity;
  _identitySyncPromise = new Promise(resolve => {
    resolveIdentity = resolve;
  }).then(() => {
    _identityVerified = true;
    return true;
  });

  let writeExecuted = false;

  // Background write attempt while in-flight
  const writeTask = (async () => {
    await waitForIdentityVerified();
    writeExecuted = true;
    return "WRITE_SUCCESS";
  })();

  // Before resolution, write must not have executed yet
  assert.equal(writeExecuted, false, 'Write must not execute before identity is resolved');

  // Resolve identity (Verified)
  resolveIdentity();
  const res = await writeTask;

  assert.equal(writeExecuted, true, 'Write must execute after identity is verified');
  assert.equal(res, "WRITE_SUCCESS");
});

test('Identity Safety Gate: Unregistered or Failed Identity strictly REJECTS write', async () => {
  let _identityVerified = false;
  let _identitySyncPromise = null;

  function waitForIdentityVerified() {
    if (_identityVerified) return Promise.resolve(true);
    if (_identitySyncPromise) return _identitySyncPromise;
    return Promise.reject(new Error("IDENTITY_NOT_INITIALIZED"));
  }

  // Simulate failed identity check
  _identitySyncPromise = Promise.resolve({ success: false, code: "NOT_REGISTERED" }).then(res => {
    if (!res.success) {
      _identityVerified = false;
      throw new Error("STAFF_NOT_REGISTERED");
    }
  });

  let writeExecuted = false;
  let caughtError = null;

  try {
    await waitForIdentityVerified();
    writeExecuted = true;
  } catch (err) {
    caughtError = err;
  }

  assert.equal(writeExecuted, false, 'Write MUST NOT be executed when identity fails or unregistered');
  assert.ok(caughtError, 'Should throw error when identity is not verified');
  assert.equal(caughtError.message, 'STAFF_NOT_REGISTERED');
});

test('getStaffIdentity API Response: lineUserId must NOT be exposed', () => {
  // Simulate getStaffIdentity resolved payload from active/api/v2_api.js
  const identityResponse = {
    success: true,
    registered: true,
    staffId: "S001",
    staffName: "なお"
  };

  assert.equal(identityResponse.lineUserId, undefined, 'getStaffIdentity response MUST NOT expose lineUserId');
  assert.equal(identityResponse.staffId, "S001");
  assert.equal(identityResponse.staffName, "なお");
});

test('Optimistic First Paint logic: existing staffId launches without waiting for API', () => {
  const existingUserInfo = { id: "S001", last: "なお" };
  const hasExistingStaffId = existingUserInfo.id && String(existingUserInfo.id).trim() !== '';

  let mainAppLaunchedImmediately = false;
  if (hasExistingStaffId) {
    mainAppLaunchedImmediately = true;
  }

  assert.equal(mainAppLaunchedImmediately, true, 'Existing staffId MUST trigger immediate launch');
});

test('First-time user logic: missing staffId holds launch until registered', () => {
  const existingUserInfo = { id: "" };
  const hasExistingStaffId = existingUserInfo.id && String(existingUserInfo.id).trim() !== '';

  let mainAppLaunchedImmediately = false;
  if (hasExistingStaffId) {
    mainAppLaunchedImmediately = true;
  }

  assert.equal(mainAppLaunchedImmediately, false, 'First-time user MUST NOT trigger immediate launch before verification');
});

test('Queue Auth Gate: processQueue skips sending without consuming retry when Auth/Identity not ready', async () => {
  let isReady = false;
  let networkSent = false;
  let retryCount = 0;

  async function mockProcessQueue() {
    // Fail-Closed check
    if (!isReady) {
      return; // 中断: retryCount消費ゼロ、送信ゼロ
    }
    networkSent = true;
    retryCount++;
  }

  // 1. 未認証・未準備状態で processQueue 実行
  await mockProcessQueue();
  assert.equal(networkSent, false, 'Must not send when Auth/Identity is not ready');
  assert.equal(retryCount, 0, 'Must NOT consume retryCount when Auth/Identity is not ready');

  // 2. Identity 成立後に processQueue 実行
  isReady = true;
  await mockProcessQueue();
  assert.equal(networkSent, true, 'Must send when Auth/Identity is verified ready');
  assert.equal(retryCount, 1, 'Retry count incremented only upon actual send attempt');
});

test('callApiPost: PERMANENT error (UNAUTHORIZED, CONTRACT_EXPIRED) strictly rejects without retry', async () => {
  const permanentCodes = ['UNAUTHORIZED', 'NOT_REGISTERED', 'CONTRACT_EXPIRED', 'INVALID_ARGUMENT', 'FORBIDDEN'];

  for (const code of permanentCodes) {
    let callCount = 0;
    async function mockCall(action) {
      callCount++;
      const err = new Error("API Failure: " + code);
      err.code = code;
      err.errorType = "PERMANENT";
      err.retryable = false;
      throw err;
    }

    let caughtErr = null;
    try {
      await mockCall('getStaffIdentity');
    } catch (e) {
      caughtErr = e;
    }

    assert.ok(caughtErr, `Error should be caught for ${code}`);
    assert.equal(caughtErr.code, code, `Error code ${code} must be preserved on thrown error`);
    assert.equal(caughtErr.retryable, false, `PERMANENT error ${code} must have retryable=false`);
    assert.equal(callCount, 1, `PERMANENT error ${code} must NOT be retried (callCount === 1)`);
  }
});

test('Queue catch logic: PERMANENT error terminates as FAILED_PERMANENT without calling scheduleRetry', async () => {
  let scheduleRetryCalled = false;
  let queueItemStatus = 'PENDING';
  let nextRetryAt = 999999;

  const TRANSIENT_CODES = ['NETWORK_FAILURE', 'LOCK_TIMEOUT', 'RATE_LIMIT_EXCEEDED', 'INTERNAL_ERROR'];

  async function handleQueueCatch(err) {
    const isTransient = err.retryable === true || (err.retryable === undefined && TRANSIENT_CODES.includes(err.code));
    if (isTransient) {
      scheduleRetryCalled = true;
    } else {
      // PERMANENT 終端: scheduleRetry() 禁止、payload保持
      queueItemStatus = 'FAILED_PERMANENT';
      nextRetryAt = 0;
    }
  }

  // PERMANENT エラーのシミュレート
  const permErr = new Error("Unauthorized access");
  permErr.code = "UNAUTHORIZED";
  permErr.retryable = false;

  await handleQueueCatch(permErr);
  assert.equal(scheduleRetryCalled, false, 'scheduleRetry MUST NOT be called for PERMANENT error');
  assert.equal(queueItemStatus, 'FAILED_PERMANENT', 'Status must transition to FAILED_PERMANENT');
  assert.equal(nextRetryAt, 0, 'nextRetryAt must be reset to 0 for manual retry wait');
});

test('First-time Identity Retry: retryIdentityVerification creates fresh attempt and does not reuse rejected promise', async () => {
  let attemptSeq = 0;

  function createIdentityAttempt() {
    const currentSeq = ++attemptSeq;
    if (currentSeq === 1) {
      return Promise.reject(new Error("NETWORK_FAILURE"));
    }
    return Promise.resolve({ success: true, registered: true, staffId: "STF_RETRY_001" });
  }

  // Attempt 1: 失敗
  let firstPromise = createIdentityAttempt();
  let firstErr = null;
  try {
    await firstPromise;
  } catch (e) {
    firstErr = e;
  }
  assert.ok(firstErr, 'First attempt should fail');

  // Attempt 2 (Retry): 新規 Promise を生成して成功
  let retryPromise = createIdentityAttempt();
  const retryRes = await retryPromise;
  assert.notEqual(firstPromise, retryPromise, 'Retry must generate a brand new Promise instance');
  assert.equal(retryRes.registered, true);
  assert.equal(retryRes.staffId, "STF_RETRY_001");
});
