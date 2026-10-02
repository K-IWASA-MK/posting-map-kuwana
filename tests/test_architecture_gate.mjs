import assert from 'assert';
import { runArchitectureGate } from '../scripts/check-architecture-gate.mjs';

const PASS_TESTS = [
  {
    name: 'comment内 innerHTML',
    head: '',
    wt: '// el.innerHTML = "hi";\n/* el["innerHTML"] = "test" */'
  },
  {
    name: 'string内 window.foo =',
    head: '',
    wt: '{\nconst a = "window.foo = 1"; const b = `window.foo = 1`; const c = \'window.foo = 1\';\n}'
  },
  {
    name: 'regex literal /innerHTML/',
    head: '',
    wt: '{\nconst re = /innerHTML/;\n}'
  },
  {
    name: 'block comment',
    head: '',
    wt: '/*\nwindow.foo = 1;\n*/'
  },
  {
    name: 'escaped quote',
    head: '',
    wt: '{\nconst a = " \\" window.foo = 1 \\" ";\n}'
  },
  {
    name: 'app.js削減',
    head: '{\nel.innerHTML = 1;\nwindow.foo = 1;\n}',
    wt: '{\nel.innerHTML = 1;\n}'
  },
  {
    name: 'app.js無変更',
    head: '{\nwindow.foo = 1;\n}',
    wt: '{\nwindow.foo = 1;\n}'
  }
];

const FAIL_TESTS = [
  {
    name: 'el.innerHTML =',
    head: '',
    wt: '{\nel.innerHTML = "hi";\n}'
  },
  {
    name: 'el[\'innerHTML\'] =',
    head: '',
    wt: '{\nel[\'innerHTML\'] = "hi";\n}'
  },
  {
    name: 'el.outerHTML =',
    head: '',
    wt: '{\nel.outerHTML = "hi";\n}'
  },
  {
    name: 'insertAdjacentHTML()',
    head: '',
    wt: '{\nel.insertAdjacentHTML("beforeend", html);\n}'
  },
  {
    name: 'window.foo =',
    head: '',
    wt: '{\nwindow.foo = 1;\n}'
  },
  {
    name: 'window[\'foo\'] =',
    head: '',
    wt: '{\nwindow[\'foo\'] = 1;\n}'
  },
  {
    name: 'globalThis.foo =',
    head: '',
    wt: '{\nglobalThis.foo = 1;\n}'
  },
  {
    name: 'multiline window.foo assignment',
    head: '',
    wt: '{\nwindow\n.foo\n= 1;\n}'
  },
  {
    name: '既存違反1削除＋新規違反1追加（総数不変）',
    head: '{\noldEl.innerHTML = "old";\n}',
    wt: '{\nnewEl.innerHTML = "new";\n}'
  }
];

const REVIEW_TESTS = [
  {
    name: 'function newFeature() {}',
    head: '',
    wt: 'function newFeature() {}'
  },
  {
    name: 'const newState = ...',
    head: '',
    wt: 'const newState = {};'
  },
  {
    name: 'let newState = ...',
    head: '',
    wt: 'let newState = {};'
  },
  {
    name: 'arrow function追加',
    head: '',
    wt: 'const myFunc = () => {};'
  },
  {
    name: 'callApiPost(...)',
    head: '',
    wt: '{\ncallApiPost("action", payload);\n}'
  }
];

let failed = false;

function runTest(test, expectedError) {
  const res = runArchitectureGate(test.wt, test.head, 'active/h-app/app.js');
  try {
    assert.strictEqual(res.hasError, expectedError, `${test.name}: expected hasError=${expectedError} but got ${res.hasError}`);
    console.log(`✅ ${test.name}`);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    failed = true;
  }
}

console.log("--- RUNNING ARCHITECTURE GATE TESTS ---");
console.log("\n[PASS TESTS]");
for (const t of PASS_TESTS) runTest(t, false);

console.log("\n[FAIL TESTS]");
for (const t of FAIL_TESTS) runTest(t, true);

console.log("\n[REVIEW_REQUIRED TESTS]");
for (const t of REVIEW_TESTS) runTest(t, true); 

console.log("\n[WARN TESTS]");
const warnRes = runArchitectureGate('\n\n\n', '', 'active/h-app/app.js');
if (warnRes.hasError === false && warnRes.wtLines > warnRes.headLines) {
  console.log(`✅ 空行だけ増加 (WT > HEAD, Error=false)`);
} else {
  console.error(`❌ 空行だけ増加 (failed)`);
  failed = true;
}

if (failed) {
  process.exit(1);
} else {
  console.log("\n🎉 ALL ARCHITECTURE GATE TESTS PASSED!");
  process.exit(0);
}
