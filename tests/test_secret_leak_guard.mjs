import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { runSecretScan } from '../scripts/check-secrets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

console.log("====================================================");
console.log("🔒 STATIC SECRET SCANNER & LEAK GUARD TEST SUITE");
console.log("====================================================");

const scratchDir = path.join(REPO_ROOT, 'tests', '.tmp_secret_test');
if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

function cleanupTmp() {
  if (fs.existsSync(scratchDir)) {
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

try {
  // ─── Test 1: scripts/** に token literal => FAIL ──────────────────────
  console.log("\n▶ [TEST 1] scripts/** に token literal => FAIL");
  const test1File = path.join(scratchDir, 'dummy_script.js');
  fs.writeFileSync(test1File, `const provisioningToken = "super_secret_admin_token_abcdef123456";\n`);
  const relPath1 = path.relative(REPO_ROOT, test1File);
  const res1 = runSecretScan([relPath1]);
  assert.ok(res1.violations.length >= 1, "Must detect plaintext secret in script file");
  assert.equal(res1.violations[0].rule, 'PLAINTEXT_SECRET_ASSIGNMENT');
  console.log("  ✅ TEST 1 PASS: Detected token literal in scripts/ simulated file");

  // ─── Test 2: active/** に password literal => FAIL ────────────────────
  console.log("\n▶ [TEST 2] active/** に password literal => FAIL");
  const test2File = path.join(scratchDir, 'dummy_active.js');
  fs.writeFileSync(test2File, `const managerPassword = "prod_password_1234567890";\n`);
  const relPath2 = path.relative(REPO_ROOT, test2File);
  const res2 = runSecretScan([relPath2]);
  assert.ok(res2.violations.length >= 1, "Must detect plaintext password in active file");
  console.log("  ✅ TEST 2 PASS: Detected password literal in active/ simulated file");

  // ─── Test 3: docs/** に本物形式credential => FAIL ─────────────────────
  console.log("\n▶ [TEST 3] docs/** に本物形式credential => FAIL");
  const test3File = path.join(scratchDir, 'dummy_doc.md');
  // Use known leaked token hash check to ensure detection
  fs.writeFileSync(test3File, `Authorization: Bearer POSTING_MAP_PROVISIONING_CORE_SECRET_2026\n`);
  const relPath3 = path.relative(REPO_ROOT, test3File);
  const res3 = runSecretScan([relPath3]);
  assert.ok(res3.violations.length >= 1, "Must detect credential in docs/ simulated file");
  console.log("  ✅ TEST 3 PASS: Detected credential in docs/ simulated file");

  // ─── Test 4: tests/** の承認済dummy => PASS ───────────────────────────
  console.log("\n▶ [TEST 4] tests/** の承認済dummy => PASS");
  const test4File = path.join(REPO_ROOT, 'tests', '.tmp_secret_test_dummy.mjs');
  fs.writeFileSync(test4File, `const token = 'test-token-123';\nconst key = 'dummy-key';\n`);
  const relPath4 = path.relative(REPO_ROOT, test4File);
  const res4 = runSecretScan([relPath4]);
  fs.unlinkSync(test4File);
  assert.equal(res4.violations.length, 0, "Approved test dummy in tests/ must PASS");
  console.log("  ✅ TEST 4 PASS: Approved test dummies in tests/ pass without violation");

  // ─── Test 5: .env / deployment.json 等 gitignored file => scanner対象外 ──
  console.log("\n▶ [TEST 5] .env / deployment.json 等 gitignored file => scanner対象外");
  const tracked = execSync('git ls-files', { cwd: REPO_ROOT, encoding: 'utf8' }).trim().split('\n');
  assert.ok(!tracked.includes('.env'), ".env must NOT be tracked in git");
  assert.ok(!tracked.includes('deployment.json'), "deployment.json must NOT be tracked in git");
  assert.ok(!tracked.some(f => f.startsWith('.secrets/')), ".secrets/* must NOT be tracked in git");
  console.log("  ✅ TEST 5 PASS: Sensitive files are strictly untracked by git and omitted from scan");

  // ─── Test 6: tracked .env accidental add => FAIL ──────────────────────
  console.log("\n▶ [TEST 6] tracked .env accidental add => FAIL");
  const res6 = runSecretScan(['.env', '.env.local', '.secrets/private.key']);
  assert.equal(res6.violations.length, 3, "Accidental tracking of .env or .secrets must FAIL immediately");
  for (const v of res6.violations) {
    assert.equal(v.rule, 'TRACKED_SECRET_FILE');
  }
  console.log("  ✅ TEST 6 PASS: Accidental tracking of .env or .secrets is rejected with exit 1");

  // ─── Test 7: Private Key header => FAIL ───────────────────────────────
  console.log("\n▶ [TEST 7] Private Key header => FAIL");
  const test7File = path.join(scratchDir, 'dummy_key.pem');
  fs.writeFileSync(test7File, `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\n`);
  const relPath7 = path.relative(REPO_ROOT, test7File);
  const res7 = runSecretScan([relPath7]);
  assert.ok(res7.violations.length >= 1, "Private key header must FAIL");
  assert.equal(res7.violations[0].rule, 'PRIVATE_KEY_HEADER');
  console.log("  ✅ TEST 7 PASS: Private key header is detected and rejected");

  // ─── Test 8: Current Tree => PASS ─────────────────────────────────────
  console.log("\n▶ [TEST 8] Current Tree => PASS");
  const res8 = runSecretScan();
  if (res8.violations.length > 0) {
    console.error("Violations in Current Tree:", res8.violations);
  }
  assert.equal(res8.violations.length, 0, "Current Tree must have 0 secret violations");
  console.log(`  ✅ TEST 8 PASS: Scanned all ${res8.scannedCount} tracked files with 0 violations`);

  // ─── Test 9: PROVISIONING_TOKEN_HASH missing => authentication Fail-Closed ──
  console.log("\n▶ [TEST 9] PROVISIONING_TOKEN_HASH missing => authentication Fail-Closed");
  const v2ApiSource = fs.readFileSync(path.join(REPO_ROOT, 'active/api/v2_api.js'), 'utf8');

  // Verify that CORE_PROVISIONING_HASH is completely gone from v2_api.js
  assert.ok(!v2ApiSource.includes('CORE_PROVISIONING_HASH'), "CORE_PROVISIONING_HASH must be completely removed from v2_api.js");

  // Test verifyProvisioningToken behavior via VM sandbox
  const sandbox = {
    computeSha256(str) {
      return crypto.createHash('sha256').update(str).digest('hex');
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            // PROVISIONING_TOKEN_HASH is MISSING (returns null)
            return null;
          }
        };
      }
    }
  };
  vm.createContext(sandbox);

  // Extract verifyProvisioningToken function source
  const vptStart = v2ApiSource.indexOf('function verifyProvisioningToken(');
  const vptEnd = v2ApiSource.indexOf('\n}\n', vptStart) + 3;
  const vptCode = v2ApiSource.substring(vptStart, vptEnd);

  vm.runInContext(vptCode, sandbox);
  const resultMissing = sandbox.verifyProvisioningToken('any-token-even-if-leaked');
  assert.equal(resultMissing.success, false, "Must fail authentication when PROVISIONING_TOKEN_HASH is missing");
  assert.equal(resultMissing.code, "UNAUTHORIZED");
  assert.ok(resultMissing.message.includes("Fail-Closed") || resultMissing.message.includes("not configured"), "Message must indicate Fail-Closed");

  // Verify behavior when PROVISIONING_TOKEN_HASH is set
  const dummyHash = crypto.createHash('sha256').update('valid-secret-12345').digest('hex');
  const sandboxConfigured = {
    computeSha256(str) {
      return crypto.createHash('sha256').update(str).digest('hex');
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            if (key === 'PROVISIONING_TOKEN_HASH') return dummyHash;
            return null;
          }
        };
      }
    }
  };
  vm.createContext(sandboxConfigured);
  vm.runInContext(vptCode, sandboxConfigured);

  const resValid = sandboxConfigured.verifyProvisioningToken('valid-secret-12345');
  assert.equal(resValid.success, true, "Must pass authentication when token matches configured hash");

  const resInvalid = sandboxConfigured.verifyProvisioningToken('wrong-token');
  assert.equal(resInvalid.success, false, "Must reject incorrect token");
  assert.equal(resInvalid.code, "UNAUTHORIZED");

  console.log("  ✅ TEST 9 PASS: Missing PROVISIONING_TOKEN_HASH enforces strict Fail-Closed; valid token passes");

  // ─── Test 10 & 11: Production Verification Probe ──────────────────────
  console.log("\n▶ [TEST 10 & 11] Production Live Probes (Old Token UNAUTHORIZED & New Token PASS)");
  const deploymentPath = path.join(REPO_ROOT, 'deployment.json');
  if (fs.existsSync(deploymentPath)) {
    const depData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    const liveUrl = depData?.resources?.webAppUrl || depData?.webAppUrl;
    
    // Load tokens from process.env or .env
    let newToken = process.env.POSTING_MAP_PROVISIONING_TOKEN || '';
    let revokedToken = process.env.POSTING_MAP_REVOKED_PROVISIONING_TOKEN || '';
    if (!newToken || !revokedToken) {
      const envPath = path.join(REPO_ROOT, '.env');
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
          if (!newToken && line.startsWith('POSTING_MAP_PROVISIONING_TOKEN=')) {
            const eqIdx = line.indexOf('=');
            newToken = line.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          }
          if (!revokedToken && line.startsWith('POSTING_MAP_REVOKED_PROVISIONING_TOKEN=')) {
            const eqIdx = line.indexOf('=');
            revokedToken = line.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          }
        }
      }
    }

    if (liveUrl && process.env.RUN_PRODUCTION_PROBE === 'true') {
      console.log(`  Probing live endpoint: ${liveUrl}`);

      // Test 10: Old revoked token probe
      if (revokedToken) {
        const resOld = await fetch(liveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'healSchemaHeaders',
            provisioningToken: revokedToken
          })
        });
        const jsonOld = await resOld.json();
        assert.equal(jsonOld.success, false, "Old revoked token must be rejected by production");
        assert.equal(jsonOld.code, "UNAUTHORIZED", "Old revoked token code must be UNAUTHORIZED");
        console.log("  ✅ TEST 10 PASS: Old revoked token rejected with HTTP 200 UNAUTHORIZED on live production");
      } else {
        console.log("  ⚠️ TEST 10 SKIPPED: POSTING_MAP_REVOKED_PROVISIONING_TOKEN not found in .env");
      }

      // Test 11: New token probe
      if (newToken) {
        const resNew = await fetch(liveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'healSchemaHeaders',
            provisioningToken: newToken
          })
        });
        const jsonNew = await resNew.json();
        // Authentication must PASS (reaches schema validation: MISSING_DISTRICT_ID)
        assert.equal(jsonNew.code, "MISSING_DISTRICT_ID", "New token must pass authentication and reach parameter validation");
        console.log("  ✅ TEST 11 PASS: New token successfully authenticated on live production");
      } else {
        console.log("  ⚠️ TEST 11 SKIPPED: POSTING_MAP_PROVISIONING_TOKEN not found in .env");
      }
    } else {
      console.log("  ℹ️ Tests 10 & 11 live probes skipped during offline unit test run (set RUN_PRODUCTION_PROBE=true to execute live)");
    }
  } else {
    console.log("  ℹ️ deployment.json not found, skipping live probe");
  }

  console.log("\n====================================================");
  console.log("🎉 ALL SECRET LEAK GUARD TESTS PASSED");
  console.log("====================================================");
} finally {
  cleanupTmp();
}
