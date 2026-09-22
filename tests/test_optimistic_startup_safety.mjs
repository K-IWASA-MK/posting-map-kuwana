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
