import { evaluate, format, pretty, isValidCode } from './calc.js';
import { createVault, unlock } from './crypto.js';
import * as db from './db.js';
import * as vault from './vault.js';

const $ = (id) => document.getElementById(id);
const screen = $('screen');
const history = $('history');

let expr = '';          // what the user has typed, in ascii form: "123+123"
let justEvaluated = false;
let config = null;      // vault key-wrapping info; null until the secret code is set up
let setupStep = 0;      // 0 = done, 1 = choose code, 2 = confirm code
let pendingCode = '';

const isOp = (c) => '+-*/'.includes(c);

/* ---------------- display ---------------- */

function show(text) {
  screen.textContent = text;
  const len = text.length;
  screen.className = 'screen' + (len > 14 ? ' s3' : len > 10 ? ' s2' : len > 7 ? ' s1' : '');
}

function refresh() {
  show(expr ? pretty(expr) : '0');
}

/* ---------------- keys ---------------- */

function press(k) {
  if (k === 'C') { expr = ''; history.textContent = ''; justEvaluated = false; return refresh(); }
  if (k === 'back') { expr = expr.slice(0, -1); justEvaluated = false; return refresh(); }
  if (k === '=') return equals();

  const last = expr.slice(-1);
  if (justEvaluated) {
    // after "=", typing a number starts fresh, typing an operator continues from the result
    if (!isOp(k) && k !== '%') expr = '';
    justEvaluated = false;
  }

  if (isOp(k)) {
    if (!expr) { if (k === '-') expr = '-'; return refresh(); }
    if (isOp(last)) {
      if (k === '-' && (last === '*' || last === '/')) expr += k;               // allow 5×-3
      else if (expr.length > 1 && isOp(expr.slice(-2, -1))) expr = expr.slice(0, -2) + k;
      else if (expr === '-') return;
      else expr = expr.slice(0, -1) + k;
      return refresh();
    }
    if (last === '.') expr = expr.slice(0, -1);
    expr += k;
  } else if (k === '%') {
    if (!/[0-9.]/.test(last)) return;
    expr += '%';
  } else if (k === '.') {
    const num = expr.split(/[+\-*/%]/).pop();
    if (num.includes('.')) return;
    if (last === '%') return;
    expr += num === '' ? '0.' : '.';
  } else {
    // digits / "00"
    if (last === '%') expr += '*';
    if (expr.length >= 40) return;
    expr += k;
  }
  refresh();
}

async function equals() {
  const typed = expr;
  if (!typed) return;

  // 1) behave like a normal calculator
  try {
    const result = format(evaluate(typed));
    history.textContent = pretty(typed) + ' =';
    show(result);
    expr = result === 'Infinity' ? '' : result.includes('e') ? '' : result;
  } catch {
    if (!isOp(typed.slice(-1))) { history.textContent = pretty(typed) + ' ='; show('Error'); expr = ''; }
  }
  justEvaluated = true;

  // 2) secret code handling
  if (setupStep) return handleSetup(typed);
  if (config && isValidCode(typed)) {
    config = (await db.getConfig()) || config; // pick up a code changed in Settings
    const key = await unlock(config, typed);
    if (key) {
      clearCalc();
      vault.open(key);
    }
  }
}

function clearCalc() {
  expr = '';
  justEvaluated = false;
  history.textContent = '';
  refresh();
}

/* ---------------- first-run setup ---------------- */

function setupText(html) {
  $('setup-text').innerHTML = html;
}

function showSetup() {
  $('setup').hidden = false;
  if (setupStep === 1) {
    $('setup-skip').hidden = true;
    setupText('Type any calculation you will remember, for example <code>123+123</code>, then press <b>=</b>.<br>' +
      'That calculation becomes the password that opens your hidden vault.');
  } else {
    $('setup-skip').hidden = false;
    setupText(`Now type <code>${pretty(pendingCode)}</code> again and press <b>=</b> to confirm.`);
  }
}

async function handleSetup(code) {
  if (setupStep === 1) {
    if (!isValidCode(code)) {
      setupText('The code must be a calculation with a sign, like <code>123+123</code> or <code>45×9</code>. Try again.');
      return;
    }
    pendingCode = code;
    setupStep = 2;
    clearCalc();
    return showSetup();
  }
  if (code !== pendingCode) {
    setupStep = 1;
    pendingCode = '';
    clearCalc();
    showSetup();
    setupText("Those didn't match. Type your secret calculation again (e.g. <code>123+123</code>) and press <b>=</b>.");
    return;
  }
  setupText('Creating your encrypted vault…');
  const { config: cfg, masterKey } = await createVault(code);
  await db.putConfig(cfg);
  config = cfg;
  setupStep = 0;
  pendingCode = '';
  $('setup').hidden = true;
  navigator.storage?.persist?.().catch(() => {});
  clearCalc();
  await vault.open(masterKey);
  vault.toast(`Vault created! Type ${pretty(code)} then = in the calculator to open it.`, 6000);
}

/* ---------------- boot ---------------- */

async function boot() {
  $('keys').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) press(b.dataset.k);
  });

  document.addEventListener('keydown', (e) => {
    if (!$('calc').hidden && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const map = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'C', Delete: 'C', x: '*', X: '*' };
      const k = map[e.key] || e.key;
      if (/^[0-9.%+\-*/=]$/.test(k) || k === 'back' || k === 'C') {
        e.preventDefault();
        press(k);
      }
    }
  });

  $('setup-skip').addEventListener('click', () => {
    setupStep = 1;
    pendingCode = '';
    clearCalc();
    showSetup();
  });

  vault.init({ onLock: clearCalc });

  config = await db.getConfig();
  if (!config) {
    setupStep = 1;
    showSetup();
  }
  refresh();

  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.AndroidBridge) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
