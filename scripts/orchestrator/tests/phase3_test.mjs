import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnWorker } from '../lib/worker_runner.mjs';
import { createHandover } from '../lib/handover_schema.mjs';
import { captureSnapshot, detectDiff } from '../lib/git_diff_guard.mjs';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(`     ${err.stack.split('\n').slice(1, 4).join('\n     ')}`);
    }
  }
}

async function main() {
  console.log('Phase 3 Test Suite: Recorder Worker Minimal Verification');

  const testRecordRelativePath = '.agents/records/record-999-phase3-recorder-test.md';
  const testRecordFullPath = resolve(process.cwd(), testRecordRelativePath);

  await runAsyncTest('Recorder Worker Independent Process Execution & PID Separation', async () => {
    try {
      const handover = createHandover({
        taskId: 'task-p3-recorder-001',
        targetAgent: 'recorder',
        action: 'record-phase3-test',
        scope: [testRecordRelativePath],
        context: {
          title: 'Phase 3 Recorder Worker Verification Test',
          recordFileName: testRecordRelativePath,
          contentBody: 'This is an automated test record generated during Phase 3 verification.'
        },
        constraints: {
          readOnly: false,
          allowedWritePaths: ['.agents/records/'],
          maxDurationMs: 15000
        }
      });

      const execution = await spawnWorker('scripts/orchestrator/workers/recorder_worker.mjs', handover);

      if (!execution.success) throw new Error('Execution did not report success');
      if (typeof execution.workerPid !== 'number' || execution.workerPid <= 0) {
        throw new Error(`Invalid workerPid: ${execution.workerPid}`);
      }
      if (execution.workerPid === execution.parentPid) {
        throw new Error(`Worker PID (${execution.workerPid}) is identical to parent PID (${execution.parentPid})! Process isolation violated.`);
      }

      if (!existsSync(testRecordFullPath)) {
        throw new Error(`Target record file was not written: ${testRecordFullPath}`);
      }

      const fileContent = readFileSync(testRecordFullPath, 'utf8');
      if (!fileContent.includes('Phase 3 Recorder Worker Verification Test')) {
        throw new Error('Written record content does not match expected title');
      }

      const res = execution.result;
      if (res.agent !== 'recorder') throw new Error(`Agent mismatch: ${res.agent}`);
      if (res.status !== 'PASS') throw new Error(`Result status is not PASS: ${res.status}`);
      if (!res.changedFiles.includes(testRecordRelativePath)) {
        throw new Error(`changedFiles does not contain ${testRecordRelativePath}`);
      }
    } finally {
      if (existsSync(testRecordFullPath)) {
        unlinkSync(testRecordFullPath);
      }
    }
  });

  await runAsyncTest('Millisecond-Precision Timestamp Verification', async () => {
    try {
      const handover = createHandover({
        taskId: 'task-p3-recorder-002',
        targetAgent: 'recorder',
        action: 'record-timestamps',
        scope: [testRecordRelativePath],
        context: {
          title: 'Timestamp Test Record',
          recordFileName: testRecordRelativePath
        },
        constraints: {
          readOnly: false,
          allowedWritePaths: ['.agents/records/']
        }
      });

      const execution = await spawnWorker('scripts/orchestrator/workers/recorder_worker.mjs', handover);

      if (typeof execution.startTime !== 'string' || !execution.startTime.includes('T')) {
        throw new Error(`Invalid startTime: ${execution.startTime}`);
      }
      if (typeof execution.endTime !== 'string' || !execution.endTime.includes('T')) {
        throw new Error(`Invalid endTime: ${execution.endTime}`);
      }
      if (typeof execution.durationMs !== 'number' || execution.durationMs < 0) {
        throw new Error(`Invalid durationMs: ${execution.durationMs}`);
      }
      if (!execution.result.details.workerStartTime || !execution.result.details.workerEndTime) {
        throw new Error('Worker internal timestamps missing in details');
      }
    } finally {
      if (existsSync(testRecordFullPath)) {
        unlinkSync(testRecordFullPath);
      }
    }
  });

  await runAsyncTest('Scope Guard: Rejection of Unauthorized Write Paths (active/)', async () => {
    const unauthorizedPath = 'active/dashboard/test_illegal.js';
    const unauthorizedFullPath = resolve(process.cwd(), unauthorizedPath);

    const handover = createHandover({
      taskId: 'task-p3-recorder-003',
      targetAgent: 'recorder',
      action: 'record-unauthorized-target',
      scope: [unauthorizedPath],
      context: {
        title: 'Unauthorized Path Attempt',
        recordFileName: unauthorizedPath
      },
      constraints: {
        readOnly: false,
        allowedWritePaths: ['.agents/records/']
      }
    });

    let blocked = false;
    try {
      await spawnWorker('scripts/orchestrator/workers/recorder_worker.mjs', handover);
    } catch (err) {
      if (err.message.includes('outside allowed record pattern') || err.message.includes('Permission Denied')) {
        blocked = true;
      } else {
        throw err;
      }
    }

    if (!blocked) {
      throw new Error('Recorder Worker failed to block unauthorized write to active/');
    }
    if (existsSync(unauthorizedFullPath)) {
      unlinkSync(unauthorizedFullPath);
      throw new Error('Unauthorized file was created on disk!');
    }
  });

  await runAsyncTest('Scope Guard: Rejection of Unauthorized Write Paths (deployment.json)', async () => {
    const unauthorizedPath = 'deployment.json';
    const handover = createHandover({
      taskId: 'task-p3-recorder-004',
      targetAgent: 'recorder',
      action: 'record-deployment-target',
      scope: [unauthorizedPath],
      context: { recordFileName: unauthorizedPath },
      constraints: { readOnly: false, allowedWritePaths: ['.agents/records/'] }
    });

    let blocked = false;
    try {
      await spawnWorker('scripts/orchestrator/workers/recorder_worker.mjs', handover);
    } catch (err) {
      if (err.message.includes('outside allowed record pattern') || err.message.includes('Permission Denied')) {
        blocked = true;
      }
    }

    if (!blocked) {
      throw new Error('Recorder Worker failed to block unauthorized write to deployment.json');
    }
  });

  await runAsyncTest('Non-Destructive Protection of Existing Official Records', async () => {
    const officialRecordPath = '.agents/records/record-999-test-official-protection.md';
    const officialFullPath = resolve(process.cwd(), officialRecordPath);
    const originalContent = '# OFFICIAL RECORD MOCK FOR PROTECTION TEST\nDo not overwrite.';
    writeFileSync(officialFullPath, originalContent, 'utf8');

    try {
      const handover = createHandover({
        taskId: 'task-p3-recorder-005',
        targetAgent: 'recorder',
        action: 'record-overwrite-attempt',
        scope: [officialRecordPath],
        context: {
          recordFileName: officialRecordPath,
          contentBody: 'Malicious attempt to overwrite official record.'
        },
        constraints: {
          readOnly: false,
          allowedWritePaths: ['.agents/records/']
        }
      });

      let blocked = false;
      try {
        await spawnWorker('scripts/orchestrator/workers/recorder_worker.mjs', handover);
      } catch (err) {
        if (err.message.includes('Existing official record') && err.message.includes('cannot be overwritten')) {
          blocked = true;
        }
      }

      if (!blocked) {
        throw new Error('Recorder Worker allowed overwriting existing official record!');
      }

      const currentContent = readFileSync(officialFullPath, 'utf8');
      if (currentContent !== originalContent) {
        throw new Error('Official record content was mutated!');
      }
    } finally {
      if (existsSync(officialFullPath)) {
        unlinkSync(officialFullPath);
      }
    }
  });

  await runAsyncTest('Cleanup and Tree Restoration Verification', async () => {
    const snapBefore = captureSnapshot();

    const handover = createHandover({
      taskId: 'task-p3-recorder-006',
      targetAgent: 'recorder',
      action: 'record-cleanup-test',
      scope: [testRecordRelativePath],
      context: {
        title: 'Cleanup Verification Record',
        recordFileName: testRecordRelativePath
      },
      constraints: {
        readOnly: false,
        allowedWritePaths: ['.agents/records/']
      }
    });

    const execution = await spawnWorker('scripts/orchestrator/workers/recorder_worker.mjs', handover);
    if (!execution.success) throw new Error('Worker failed');

    if (!existsSync(testRecordFullPath)) {
      throw new Error('Record was not created');
    }

    unlinkSync(testRecordFullPath);

    const snapAfter = captureSnapshot();
    const diff = detectDiff(snapBefore, snapAfter);

    if (diff.hasDiff) {
      throw new Error(`Working tree was not restored cleanly after cleanup:\n${diff.diffSummary}`);
    }
  });

  console.log(`Phase 3 Test Summary: Total: ${totalTests}, Passed: ${passedTests}, Failed: ${failedTests}`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

main();
