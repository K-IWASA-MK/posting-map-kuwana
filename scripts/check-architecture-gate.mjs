import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, normalize } from 'path';

const rootDir = process.cwd();

// --- 1. Targeted Lexical Scanner ---
export function tokenize(code) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let depth = 0;

  const isAlphaNum = (c) => /[a-zA-Z0-9_$]/.test(c);
  const isAlpha = (c) => /[a-zA-Z_$]/.test(c);
  const isDigit = (c) => /[0-9]/.test(c);
  const isSpace = (c) => /\s/.test(c);

  let lastTokenType = null;
  let lastTokenValue = null;

  while (i < code.length) {
    const char = code[i];
    
    if (char === '\n') {
      line++;
      i++;
      continue;
    }
    if (isSpace(char)) {
      i++;
      continue;
    }

    // Line comment
    if (char === '/' && code[i+1] === '/') {
      i += 2;
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    // Block comment
    if (char === '/' && code[i+1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i+1] === '/')) {
        if (code[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }

    // Regex literal heuristic
    if (char === '/') {
      const isRegexContext = !lastTokenType || ['punctuator', 'keyword'].includes(lastTokenType);
      const invalidRegexPrev = new Set([']', ')', '}']);
      if (isRegexContext && (!lastTokenValue || !invalidRegexPrev.has(lastTokenValue))) {
        let regexVal = '/';
        i++;
        let inClass = false;
        while (i < code.length) {
          if (code[i] === '\\') { regexVal += code[i] + code[i+1]; i+=2; continue; }
          if (code[i] === '[') inClass = true;
          if (code[i] === ']') inClass = false;
          if (code[i] === '/' && !inClass) {
             regexVal += '/';
             i++;
             break;
          }
          if (code[i] === '\n') {
             // Invalid regex, rollback (simplified)
             break;
          }
          regexVal += code[i];
          i++;
        }
        tokens.push({ type: 'regex', value: regexVal, line, depth });
        lastTokenType = 'regex';
        lastTokenValue = regexVal;
        continue;
      }
    }

    // Strings
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      let strVal = quote;
      i++;
      while (i < code.length) {
        if (code[i] === '\\') { 
          strVal += code[i] + code[i+1]; 
          if (code[i+1] === '\n') line++;
          i+=2; 
          continue; 
        }
        if (code[i] === quote) {
          strVal += quote;
          i++;
          break;
        }
        if (code[i] === '\n') line++;
        strVal += code[i];
        i++;
      }
      tokens.push({ type: 'string', value: strVal, line, depth });
      lastTokenType = 'string';
      lastTokenValue = strVal;
      continue;
    }

    if (isDigit(char)) {
      let numVal = '';
      while (i < code.length && isDigit(code[i])) {
        numVal += code[i++];
      }
      tokens.push({ type: 'number', value: numVal, line, depth });
      lastTokenType = 'number';
      lastTokenValue = numVal;
      continue;
    }

    if (isAlpha(char)) {
      let idVal = '';
      while (i < code.length && isAlphaNum(code[i])) {
        idVal += code[i++];
      }
      const keywords = ['let', 'const', 'var', 'function', 'class', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'import', 'export'];
      const type = keywords.includes(idVal) ? 'keyword' : 'identifier';
      tokens.push({ type, value: idVal, line, depth });
      lastTokenType = type;
      lastTokenValue = idVal;
      continue;
    }

    const doublePuncts = ['==', '!=', '===', '!==', '<=', '>=', '=>', '++', '--', '&&', '||', '??', '+=', '-=', '*=', '/='];
    let pVal = char;
    if (i + 1 < code.length && doublePuncts.includes(code.substring(i, i+2))) {
      pVal = code.substring(i, i+2);
      i += 2;
    } else {
      i++;
    }

    if (pVal === '}') {
      depth = Math.max(0, depth - 1);
    }
    
    tokens.push({ type: 'punctuator', value: pVal, line, depth });
    lastTokenType = 'punctuator';
    lastTokenValue = pVal;

    if (pVal === '{') {
      depth++;
    }
  }
  return tokens;
}

// --- 2. Findings Extractor ---
function getContextFingerprint(tokens, index) {
  let start = index;
  while (start > 0 && tokens[start].value !== ';' && tokens[start].value !== '{' && tokens[start].value !== '}') {
    start--;
  }
  let end = index;
  while (end < tokens.length - 1 && tokens[end].value !== ';' && tokens[end].value !== '{' && tokens[end].value !== '}') {
    end++;
  }
  return tokens.slice(start + 1, end).map(t => t.value).join('');
}

export function analyzeTokens(tokens, filePath) {
  const findings = [];
  const isAppJs = filePath.endsWith('app.js');

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const next2 = tokens[i + 2];
    const next3 = tokens[i + 3];

    if (isAppJs) {
      if (t.type === 'identifier' && (t.value === 'innerHTML' || t.value === 'outerHTML')) {
        if (prev && prev.value === '.' && next && ['=', '+=', '-='].includes(next.value)) {
          findings.push({ kind: 'HARD_FAIL:DOM_STRING', file: filePath, symbol: t.value, fingerprint: getContextFingerprint(tokens, i) });
        }
      }
      if (t.type === 'string' && (t.value === "'innerHTML'" || t.value === '"innerHTML"' || t.value === '`innerHTML`')) {
        if (prev && prev.value === '[' && next && next.value === ']' && next2 && ['=', '+=', '-='].includes(next2.value)) {
          findings.push({ kind: 'HARD_FAIL:DOM_STRING', file: filePath, symbol: 'innerHTML_bracket', fingerprint: getContextFingerprint(tokens, i) });
        }
      }
      if (t.type === 'identifier' && t.value === 'insertAdjacentHTML') {
        if (prev && prev.value === '.' && next && next.value === '(') {
          findings.push({ kind: 'HARD_FAIL:DOM_STRING', file: filePath, symbol: 'insertAdjacentHTML', fingerprint: getContextFingerprint(tokens, i) });
        }
      }

      if (t.type === 'identifier' && (t.value === 'window' || t.value === 'globalThis')) {
        if (next && next.value === '.' && next2 && next2.type === 'identifier' && next3 && ['=', '+=', '-='].includes(next3.value)) {
          findings.push({ kind: 'HARD_FAIL:GLOBAL_EXPOSURE', file: filePath, symbol: `${t.value}.${next2.value}`, fingerprint: getContextFingerprint(tokens, i) });
        }
        if (next && next.value === '[' && next2 && next2.type === 'string' && next3 && next3.value === ']') {
          const next4 = tokens[i + 4];
          if (next4 && ['=', '+=', '-='].includes(next4.value)) {
            findings.push({ kind: 'HARD_FAIL:GLOBAL_EXPOSURE', file: filePath, symbol: `${t.value}[${next2.value}]`, fingerprint: getContextFingerprint(tokens, i) });
          }
        }
      }

      if (t.depth === 0) {
        if (t.type === 'keyword' && ['let', 'const', 'var'].includes(t.value)) {
          findings.push({ kind: 'REVIEW_REQUIRED:TOP_LEVEL_STATE', file: filePath, symbol: t.value, fingerprint: getContextFingerprint(tokens, i) });
        }
        if (t.type === 'keyword' && t.value === 'function') {
          findings.push({ kind: 'REVIEW_REQUIRED:TOP_LEVEL_FUNCTION', file: filePath, symbol: 'function', fingerprint: getContextFingerprint(tokens, i) });
        }
        if (t.type === 'punctuator' && t.value === '=>') {
          findings.push({ kind: 'REVIEW_REQUIRED:TOP_LEVEL_FUNCTION', file: filePath, symbol: 'arrow_function', fingerprint: getContextFingerprint(tokens, i) });
        }
      }

      if (t.type === 'identifier' && t.value === 'callApiPost') {
        findings.push({ kind: 'REVIEW_REQUIRED:CALL_API_POST', file: filePath, symbol: 'callApiPost', fingerprint: getContextFingerprint(tokens, i) });
      }
    }
  }
  return findings;
}

// --- 3. Core Gate Logic ---
export function runArchitectureGate(mockWtContent = null, mockHeadContent = null, filePath = 'active/h-app/app.js') {
  let headContent = '';
  let wtContent = '';

  try {
    if (mockHeadContent !== null) headContent = mockHeadContent;
    else {
      try {
        headContent = execSync(`git show HEAD:${filePath}`, { cwd: rootDir, stdio: 'pipe' }).toString('utf8');
      } catch (e) {
        // file not in HEAD
      }
    }
    
    if (mockWtContent !== null) wtContent = mockWtContent;
    else if (existsSync(resolve(rootDir, filePath))) wtContent = readFileSync(resolve(rootDir, filePath), 'utf8');
  } catch (e) {
    // ignore
  }

  const headTokens = tokenize(headContent);
  const wtTokens = tokenize(wtContent);

  const headFindings = analyzeTokens(headTokens, filePath);
  const wtFindings = analyzeTokens(wtTokens, filePath);

  const headMultiset = headFindings.map(f => `${f.kind}::${f.symbol}::${f.fingerprint}`);
  const wtMultiset = wtFindings.map(f => `${f.kind}::${f.symbol}::${f.fingerprint}`);

  for (const h of headMultiset) {
    const index = wtMultiset.indexOf(h);
    if (index !== -1) {
      wtMultiset.splice(index, 1);
    }
  }

  const headLines = headContent.split('\n').length;
  const wtLines = wtContent.split('\n').length;


  let hasError = false;

  console.log(`[Architecture Guard] Scanning ${filePath}...`);

  if (wtLines > headLines) {
    console.warn(`⚠️ [WARN] ${filePath} line count increased!`);
    console.warn(`   HEAD lines: ${headLines}`);
    console.warn(`   WT lines:   ${wtLines}`);
    console.warn(`   Delta:      +${wtLines - headLines}`);
  }

  if (wtMultiset.length > 0) {
    console.error(`\\n🛑 [Architecture Guard Failed] Net-New Violations Detected in ${filePath}:`);
    for (const v of wtMultiset) {
      const [kind, symbol, fingerprint] = v.split('::');
      console.error(`   - [${kind}] ${symbol}`);
      console.error(`     Fingerprint: ${fingerprint}`);
      hasError = true;
    }
  }

  return { hasError, headLines, wtLines, newViolations: wtMultiset };
}

// If run directly from CLI
import { fileURLToPath } from 'url';
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runArchitectureGate();
  if (result.hasError) {
    process.exit(1);
  }
  console.log('✅ [Architecture Guard] PASSED: No Net-New Architecture Violations.');
  process.exit(0);
}
