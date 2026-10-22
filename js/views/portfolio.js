import { h, mount, money, chip, statusChip } from '../ui.js';
import * as data from '../data.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

export function quadrantChart(rows, valueModel, { highlight } = {}) {
  const W = 520; const H = 380; const P = { l: 52, r: 18, t: 18, b: 46 };
  const split = valueModel.quadrant.split; const L = valueModel.quadrant.labels;
  const x = (v) => P.l + (v / 100) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / 100) * (H - P.t - P.b);
  const root = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Customer health versus value realization' });
  // [x0, x1, y0, y1, fill] in score space
  const fills = [[0, split, split, 100, '#FEF3E2'], [split, 100, split, 100, '#E8F5EE'], [0, split, 0, split, '#FDEDEB'], [split, 100, 0, split, '#FEF9E7']];
  fills.forEach(([x0, x1, y0, y1, fill]) => {
    root.appendChild(s('rect', { x: x(x0), y: y(y1), width: x(x1) - x(x0), height: y(y0) - y(y1), fill, opacity: 0.7 }));
  });
  root.appendChild(s('line', { x1: x(split), x2: x(split), y1: y(0), y2: y(100), stroke: '#C9C3B8', 'stroke-dasharray': '4 4' }));
  root.appendChild(s('line', { x1: x(0), x2: x(100), y1: y(split), y2: y(split), stroke: '#C9C3B8', 'stroke-dasharray': '4 4' }));
  root.appendChild(s('rect', { x: x(0), y: y(100), width: x(100) - x(0), height: y(0) - y(100), fill: 'none', stroke: '#E2DED6' }));
  const lab = (txt, xx, yy, anchor) => root.appendChild(s('text', { x: xx, y: yy, 'font-size': 10.5, 'font-weight': 700, fill: '#6B7383', 'text-anchor': anchor, 'letter-spacing': '0.04em' }, txt.toUpperCase()));
  lab(L.lowHealth_highValue, x(2), y(97), 'start');
  lab(L.highHealth_highValue, x(98), y(97), 'end');
  lab(L.lowHealth_lowValue, x(2), y(3), 'start');
  lab(L.highHealth_lowValue, x(98), y(3), 'end');
  [0, 50, 100].forEach((t) => {
    root.appendChild(s('text', { x: x(t), y: H - P.b + 16, 'font-size': 11, fill: '#6B7383', 'text-anchor': 'middle' }, String(t)));
    root.appendChild(s('text', { x: P.l - 8, y: y(t) + 4, 'font-size': 11, fill: '#6B7383', 'text-anchor': 'end' }, String(t)));
  });
  root.appendChild(s('text', { x: (x(0) + x(100)) / 2, y: H - 8, 'font-size': 12, 'font-weight': 600, fill: '#3D4451', 'text-anchor': 'middle' }, 'Customer health'));
  const yl = s('text', { x: 14, y: (y(0) + y(100)) / 2, 'font-size': 12, 'font-weight': 600, fill: '#3D4451', 'text-anchor': 'middle', transform: `rotate(-90 14 ${(y(0) + y(100)) / 2})` }, 'Value realization');
  root.appendChild(yl);
  const mark = (r, i) => r.account.scenario || String(i + 1);
  rows.forEach((r, i) => {
    const cx = x(r.health.score); const cy = y(r.value.score);
    const g = s('g', { style: 'cursor:pointer' });
    const t = s('title', {}, `${r.account.name}: health ${r.health.score}, value ${r.value.score}`);
    g.appendChild(t);
    g.appendChild(s('circle', { cx, cy, r: 11, fill: '#0D1117', stroke: '#fff', 'stroke-width': 2 }));
    g.appendChild(s('text', { x: cx, y: cy + 4, 'font-size': 11, 'font-weight': 700, fill: '#fff', 'text-anchor': 'middle' }, mark(r, i)));
    g.addEventListener('click', () => { location.hash = `#/account/${r.account.id}/health`; });
    root.appendChild(g);
  });
  const legend = h('div', { class: 'quad-legend' }, rows.map((r, i) => h('a', { href: `#/account/${r.account.id}/health` },
    h('span', { class: 'quad-key' }, mark(r, i)), h('span', null, r.account.name), h('span', { class: 'muted' }, ` ${r.health.score} / ${r.value.score}`))));
  return h('div', { class: 'quadrant' }, root, highlight === false ? null : legend);
}

export async function renderPortfolio(main) {
  const rows = (await Promise.all(data.accounts().map((a) => data.evaluate(a)))).filter(Boolean);
  const total = rows.reduce((sum, r) => sum + (r.account.contractValue || 0), 0);
  const atRisk = rows.filter((r) => r.health.overallStatus === 'At risk');
  const arrAtRisk = atRisk.reduce((sum, r) => sum + (r.account.contractValue || 0), 0);
  const valueGap = rows.filter((r) => r.value.status !== 'green');
  const renewing = rows.filter((r) => ['High', 'Elevated'].includes(r.health.renewalRisk));

  mount(main, 
    h('div', { class: 'notice' }, data.state.notice || 'Fictional demonstration data.'),
    h('div', { class: 'hero' },
      h('div', null,
        h('div', { class: 'eyebrow' }, 'CleverHealth'),
        h('h1', { class: 'display' }, 'Customer Intelligence & Value Realization'),
        h('p', { class: 'lede' }, 'Connect customer engagement, technology adoption, and business outcomes to identify risk, accelerate value realization, and drive accountable action.'),
        h('div', { class: 'btn-row', style: 'margin-top:18px' },
          h('a', { class: 'btn primary', href: '#/assess' }, 'New assessment'),
          h('a', { class: 'btn', href: '#/config' }, 'How scoring works'))),
      h('div', { class: 'kpi-strip' },
        tile(money(total), `ARR across ${rows.length} accounts`),
        tile(money(arrAtRisk), `ARR at risk (${atRisk.length} accounts)`),
        tile(String(valueGap.length), 'Accounts with unproven value'),
        tile(String(renewing.length), 'Renewals with elevated risk'))),
    h('div', { class: 'section-title' }, h('span', null, 'Select a fictional customer')),
    h('div', { class: 'grid g4' }, rows.map(scenarioCard)),
    h('div', { class: 'grid g2', style: 'margin-top:28px;align-items:start' },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, 'Health vs value'),
        h('div', { class: 'card-pad' }, quadrantChart(rows, data.state.valueModel),
          h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Relationship health and value realization are scored separately. An account can look healthy while its business value is still unproven.'))),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, 'Portfolio'),
        h('div', { class: 'table-wrap' }, portfolioTable(rows)))),
  );
}

function tile(v, l) { return h('div', { class: 'card kpi-tile' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l)); }

function scenarioCard(r) {
  const a = r.account; const p = r.profile;
  return h('a', { class: 'card scenario-card', href: `#/account/${a.id}/health` },
    p.isExample ? h('span', { class: 'example-tag' }, chip('Applied example', 'dark')) : null,
    h('div', { class: 'scenario-letter' }, a.scenario ? `Scenario ${a.scenario}` : 'Custom account'),
    h('div', { class: 'scenario-name' }, a.name),
    h('div', { class: 'scenario-sub' }, a.scenarioLabel || a.industry),
    h('div', { class: 'small muted' }, `${a.industry} · ${money(a.contractValue)} ARR`),
    p.isExample ? h('div', { class: 'small', style: 'color:var(--accent)' }, p.label.replace('Enterprise MarTech: ', '')) : null,
    h('div', { class: 'scenario-scores' },
      mini('Health', r.health.score, r.health.status),
      mini('Value', r.value.score, r.value.status)),
    h('div', { class: 'small', style: 'font-weight:600' }, r.health.archetype.label));
}
function mini(l, v, st) { return h('div', { class: 'mini-score' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, h('span', { class: `dot ${st}` }), String(v))); }

function portfolioTable(rows) {
  return h('table', { class: 'data' },
    h('thead', null, h('tr', null, ['Account', 'ARR', 'Renewal', 'Health', 'Value', 'Pattern'].map((t) => h('th', null, t)))),
    h('tbody', null, rows.map((r) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/account/${r.account.id}/health`; } },
      h('td', null, h('div', { style: 'font-weight:600' }, r.account.name), h('div', { class: 'small muted' }, r.account.segment || '')),
      h('td', null, money(r.account.contractValue)),
      h('td', null, r.account.monthsToRenewal != null ? `${r.account.monthsToRenewal} mo` : 'Unknown', h('div', { class: 'small muted' }, r.health.renewalRisk)),
      h('td', null, statusChip(r.health.status, `${r.health.score}`), h('div', { class: 'small muted', style: 'margin-top:3px' }, r.health.overallStatus)),
      h('td', null, statusChip(r.value.status, `${r.value.score}`)),
      h('td', { class: 'small' }, r.health.archetype.label)))));
}
