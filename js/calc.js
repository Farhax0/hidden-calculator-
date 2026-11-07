// Safe arithmetic evaluator (no eval). Supports + - * / %, decimals and unary minus.

const OPS = { '+': 1, '-': 1, '*': 2, '/': 2 };

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const s = expr.slice(i, j);
      if ((s.match(/\./g) || []).length > 1) throw new Error('bad number');
      tokens.push({ t: 'num', v: parseFloat(s === '.' ? '0' : s) });
      i = j;
    } else if (c === '%') {
      const prev = tokens[tokens.length - 1];
      if (!prev || prev.t !== 'num') throw new Error('bad %');
      prev.v = prev.v / 100;
      i++;
    } else if (c in OPS) {
      const prev = tokens[tokens.length - 1];
      if (c === '-' && (!prev || prev.t === 'op')) tokens.push({ t: 'neg' });
      else tokens.push({ t: 'op', v: c });
      i++;
    } else {
      throw new Error('bad char');
    }
  }
  return tokens;
}

export function evaluate(expr) {
  const tokens = tokenize(expr);
  const out = [];
  const stack = [];
  const apply = (op) => {
    if (op === 'neg') {
      if (!out.length) throw new Error('syntax');
      out.push(-out.pop());
      return;
    }
    if (out.length < 2) throw new Error('syntax');
    const b = out.pop(), a = out.pop();
    out.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
  };
  for (const tk of tokens) {
    if (tk.t === 'num') out.push(tk.v);
    else if (tk.t === 'neg') stack.push('neg');
    else {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top === 'neg' || OPS[top] >= OPS[tk.v]) apply(stack.pop());
        else break;
      }
      stack.push(tk.v);
    }
    // unary minus binds to the number right after it
    if (tk.t === 'num') while (stack[stack.length - 1] === 'neg') apply(stack.pop());
  }
  while (stack.length) apply(stack.pop());
  if (out.length !== 1 || !Number.isFinite(out[0])) throw new Error('syntax');
  return out[0];
}

export function format(n) {
  if (Object.is(n, -0)) n = 0;
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(8).replace(/\.?0+e/, 'e');
  return String(parseFloat(n.toPrecision(14)));
}

/** Pretty display: ascii operators -> calculator symbols. */
export function pretty(expr) {
  return expr.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
}

/** Normalise anything a user might type as a code into the ascii form the calculator produces. */
export function normalizeCode(s) {
  return String(s)
    .replace(/\s+/g, '')
    .replace(/[×xX]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-');
}

export function isValidCode(code) {
  return /^[0-9.+\-*/%]{3,32}$/.test(code) && /[0-9]/.test(code) && /[+\-*/%]/.test(code.slice(1));
}
