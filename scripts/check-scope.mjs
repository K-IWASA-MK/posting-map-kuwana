import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, normalize } from 'path';

const rootDir = process.cwd();

function exitFail(message) {
  console.error(`\n🛑 [Hard Stop] Scope Guard Failed: ${message}`);
  process.exit(1);
}

// 1. Fetch Git Changed Files via `git status --porcelain=v1 -z`
let gitStatusOutput;
try {
  gitStatusOutput = execSync('git status --porcelain=v1 -z', { cwd: rootDir });
} catch (e) {
  exitFail(`Failed to execute git status: ${e.message}`);
}

const changedFiles = [];
const tokens = gitStatusOutput.toString('utf8').split('\0').filter(Boolean);

for (let i = 0; i < tokens.length; i++) {
  const token = tokens[i];
  if (token.length < 4) continue;
  const status = token.substring(0, 2);
  const filePath = normalize(token.substring(3).trim());

  changedFiles.push(filePath);

  // If status is rename/copy, next token is original path
  if (status.includes('R') || status.includes('C')) {
    i++;
  }
}

console.log(`[Scope Guard] Checking ${changedFiles.length} changed file(s)...`);

const isScopeOnlyMode = process.argv.includes('--scope-only');
const scopeFilePath = normalize('.agents/current-scope.json');
const hasScopeJsonChanged = changedFiles.includes(scopeFilePath);

// ─────────────────────────────────────────────────────────────
// 【モード 1: Scope 更新専用検証モード (--scope-only)】
// ─────────────────────────────────────────────────────────────
if (isScopeOnlyMode) {
  const nonScopeFiles = changedFiles.filter(f => f !== scopeFilePath);
  if (nonScopeFiles.length > 0) {
    exitFail(`Scope Transaction Violation: Code changes detected during scope-only update: ${nonScopeFiles.join(', ')}`);
  }
  if (!hasScopeJsonChanged) {
    exitFail('Scope Transaction Warning: No changes detected in .agents/current-scope.json.');
  }
  console.log('🟢 [Scope-Only Mode] PASSED: Scope definition update isolated with zero code changes.');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// 【モード 2: 実装コミット検証モード (デフォルト)】
// ─────────────────────────────────────────────────────────────

// [防衛 1] コード変更と同時に Scope 定義を変更することは禁止 (自己承認の遮断)
if (hasScopeJsonChanged) {
  exitFail('Unauthorized Scope Tampering: .agents/current-scope.json cannot be modified alongside code changes. Use 2-phase scope commit.');
}

// [防衛 2] Git HEAD 上の current-scope.json を読み込み、実装変更がすべてその範囲内か検証
let allowedScope = [];
try {
  const headScopeJson = execSync('git show HEAD:.agents/current-scope.json', { cwd: rootDir }).toString('utf8');
  allowedScope = JSON.parse(headScopeJson);
  if (!Array.isArray(allowedScope)) {
    exitFail('Git HEAD current-scope.json must be an array.');
  }
} catch (e) {
  exitFail(`Failed to load approved Scope from Git HEAD: ${e.message}`);
}

const normalizedAllowed = new Set(allowedScope.map(p => normalize(p)));
const violations = changedFiles.filter(f => !normalizedAllowed.has(f));

if (violations.length > 0) {
  console.error('❌ Scope Violations Detected:');
  violations.forEach(f => console.error(`  - ${f}`));
  exitFail(`${violations.length} file(s) outside allowed Git-HEAD scope.`);
}

console.log('🟢 Scope Validation PASSED: All code changes are within the approved Git-HEAD scope.');

// [防衛 3] Governance Separation Control (改ざん耐性)
const governanceFiles = new Set([
  normalize('scripts/check-scope.mjs'),
  normalize('scripts/check-architecture-gate.mjs'),
  normalize('package.json'),
  normalize('AGENTS.md')
]);

const hasGovernanceChanges = changedFiles.some(f => governanceFiles.has(f));
const hasAppChanges = changedFiles.some(f => f.startsWith(normalize('active/h-app/')));

if (hasGovernanceChanges && hasAppChanges) {
  exitFail('Governance Separation Violation: Cannot modify Architecture Governance Files and active/h-app/** in the same transaction.');
}

// ─────────────────────────────────────────────────────────────
// 【モード 3: Architecture Guard (実装コミット時のみ実行)】
// ─────────────────────────────────────────────────────────────
console.log('\n[Architecture Guard] Executing Mechanical Architecture Guard...');
try {
  execFileSync(
    process.execPath,
    [resolve(rootDir, 'scripts/check-architecture-gate.mjs')],
    { cwd: rootDir, stdio: 'inherit' }
  );
} catch (e) {
  exitFail('Architecture Guard Failed. See details above.');
}

// 5. Scope Guard Complete
console.log('\n✅ [Scope Guard Complete] Scope Validation Succeeded.');
process.exit(0);

