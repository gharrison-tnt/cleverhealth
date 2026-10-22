// Safe DOM builder. All model output is rendered as text, never as HTML.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') throw new Error('Raw HTML is not allowed');
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

// Static SVG markup authored in this codebase only (icons, charts built from numbers).
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

export const money = (n) => {
  if (n === null || n === undefined || n === '') return 'Unknown';
  const v = Number(n);
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${v}`;
};

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
export const statusWord = (s) => ({ green: 'Green', yellow: 'Yellow', red: 'Red', unknown: 'Unknown' }[s] || s);
export const basisLabel = (b) => ({ stated: 'Stated', inferred: 'Inferred', account: 'Account data', none: 'No evidence', computed: 'Calculated' }[b] || b);

export function chip(text, cls = '') { return h('span', { class: `chip ${cls}` }, text); }
export function statusChip(status, text) { return h('span', { class: `chip ${status}` }, h('span', { class: `dot ${status}` }), text || statusWord(status)); }

export function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// Append children to an existing element, skipping null/false (native append would print "null").
export function mount(el, ...children) { append(el, children); return el; }
