import { h, mount, chip, toast } from '../ui.js';
import * as data from '../data.js';

export function renderConfig(main, selected) {
  const profiles = data.visibleProfiles();
  const pid = selected && data.state.profiles[selected] ? selected : data.defaultProfileId();
  const p = data.state.profiles[pid];
  const spec = data.specFor(p);
  const hm = data.state.healthModel; const vm = data.state.valueModel;
  const overrides = p.indicatorOverrides || {};

  const sel = h('select', { style: 'max-width:420px' }, profiles.map((x) => h('option', { value: x.id, selected: x.id === pid }, x.label + (x.custom ? ' (imported)' : ''))));
  sel.addEventListener('change', () => { location.hash = `#/config/${sel.value}`; });

  const fileIn = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const problems = validateProfile(j);
      if (problems.length) { toast(`Profile not loaded: ${problems[0]}`); return; }
      if (data.state.profiles[j.id] && !data.state.profiles[j.id].custom) j.id = `custom-${j.id}`;
      data.addProfile(j); toast(`Loaded profile: ${j.label}`); location.hash = `#/config/${j.id}`;
    } catch (e) { toast(`Could not read file: ${e.message}`); }
  });

  const download = () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${p.id}.json` }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  mount(main, 
    h('a', { href: '#/', class: 'small muted', style: 'text-decoration:none' }, '← Portfolio'),
    h('div', { class: 'eyebrow', style: 'margin-top:12px' }, 'Configuration'),
    h('h2', { class: 'display', style: 'margin-bottom:8px' }, 'How scoring works'),
    h('p', { class: 'lede', style: 'margin-bottom:18px' }, 'The four-pillar method and the scoring rules stay fixed. A company profile changes the language, the indicator definitions, the owner roles, and the maturity stages, with no code changes.'),
    h('div', { class: 'card card-pad', style: 'margin-bottom:16px' },
      h('div', { class: 'btn-row' }, sel,
        h('button', { class: 'btn', onclick: download }, 'Download profile JSON'),
        h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Load a profile'), fileIn,
        h('button', { class: 'btn ghost', onclick: () => { data.resetDemo(); toast('Demo data reset to the original dataset.'); location.hash = '#/'; } }, 'Reset demo data')),
      p.exampleNote ? h('p', { class: 'small muted', style: 'margin-top:10px' }, p.exampleNote) : null),

    h('div', { class: 'grid g2', style: 'align-items:start' },
      card('Company profile', kv([
        ['Company', p.company.name], ['Industry', p.company.industry], ['Product category', p.company.productCategory],
        ['Customer segments', p.customerSegments.join(', ')], ['Customer objectives', p.customerObjectives.join('; ')],
        ['Lifecycle', p.lifecycle.join(' → ')], ['Adoption signals', p.signals.adoption.join('; ')], ['Engagement signals', p.signals.engagement.join('; ')],
        ['Business KPIs', p.kpis.join('; ')], ['Data sources', p.dataSources.join(', ')],
        ['Terminology', Object.entries(p.terminology || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')],
        ['Assessment guidance', p.assessmentGuidance]])),
      h('div', null,
        card('Customer success operating model', h('div', { class: 'card-pad' }, h('p', { class: 'small muted', style: 'margin-bottom:10px' }, p.operatingModel.summary),
          h('div', { class: 'list' }, p.operatingModel.roles.map((r) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, r.label), ' ', chip(r.side, `side-${r.side}`), h('div', { class: 'small muted' }, r.owns))))))),
        card('Maturity stages', h('div', { class: 'card-pad list' }, p.maturityStages.map((s) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, `${s.stage}. ${s.name}`), h('div', { class: 'small muted' }, s.definition)))))))),

    h('div', { class: 'section-title' }, h('span', null, `Health scoring · ${hm.id}`)),
    card(`Levels: strong ${hm.levels.strong}, partial ${hm.levels.partial}, absent ${hm.levels.absent} · Green ≥ ${hm.thresholds.green}, yellow ≥ ${hm.thresholds.yellow}`,
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, ['Pillar', 'Indicator', 'Definition', 'Source', 'Weight'].map((t) => h('th', null, t)))),
        h('tbody', null, spec.pillars.flatMap((pl) => pl.indicators.map((i, idx) => h('tr', null,
          h('td', null, idx === 0 ? h('div', null, h('strong', null, pl.label), h('div', { class: 'small muted' }, `${Math.round(pl.weight * 100)}% · unknown = ${pl.unknownPolicy === 'absent' ? 'scored absent' : 'excluded'}`)) : ''),
          h('td', null, h('div', { style: 'font-weight:600' }, i.label), overrides[i.id] ? chip('Profile override', 'stated') : null),
          h('td', { class: 'small' }, i.definition, i.rule ? h('div', { class: 'muted' }, `Rule on ${i.rule.field}: ${i.rule.bands.map((b) => `${b.max !== undefined ? `≤${b.max}` : b.min !== undefined ? `≥${b.min}` : 'else'} ${b.level}`).join(', ')}`) : null),
          h('td', null, chip(i.source === 'account' ? 'Account data' : 'Transcript', i.source === 'account' ? 'account' : 'outline')),
          h('td', null, String(i.weight ?? 1))))))))),
    h('div', { class: 'grid g2', style: 'align-items:start' },
      card('Overall status rules', h('div', { class: 'card-pad list' },
        h('div', { class: 'item low' }, h('div', { class: 'grow' }, h('strong', null, 'Healthy: '), hm.overall.healthyRule)),
        h('div', { class: 'item high' }, h('div', { class: 'grow' }, h('strong', null, 'At risk: '), hm.overall.atRiskRule)),
        h('div', { class: 'item medium' }, h('div', { class: 'grow' }, h('strong', null, 'Watch: '), 'Everything else')),
        h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, 'Confidence: '), 'Share of indicators backed by stated or account evidence. Inferred counts half.')))),
      card('Customer patterns (first match wins)', h('div', { class: 'card-pad list' }, hm.archetypes.map((a) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('strong', null, a.label), h('div', { class: 'small muted' }, a.description))))))),

    h('div', { class: 'section-title' }, h('span', null, `Value realization scoring · ${vm.id}`)),
    card('Dimensions', h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ['Dimension', 'How it is calculated', 'Weight'].map((t) => h('th', null, t)))),
      h('tbody', null, spec.valueDimensions.map((d) => h('tr', null,
        h('td', { style: 'font-weight:600' }, d.label),
        h('td', { class: 'small' }, d.definition, h('div', { class: 'muted' }, d.method === 'indicator' ? 'AI-extracted level, then scored by rule' : 'Calculated from extracted KPIs, objectives, and use cases')),
        h('td', null, `${Math.round(d.weight * 100)}%`))))))),
  );
}

function card(title, body) { return h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'card-head' }, title), body); }
function kv(rows) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('tbody', null, rows.filter(([, v]) => v).map(([k, v]) => h('tr', null, h('td', { class: 'small muted', style: 'width:34%;font-weight:600' }, k), h('td', { class: 'small' }, v))))));
}

export function validateProfile(j) {
  const p = [];
  if (!j || typeof j !== 'object') return ['Not a JSON object'];
  if (!j.id || !/^[a-z0-9-]{3,60}$/.test(j.id)) p.push('id must be 3 to 60 lowercase letters, numbers, or dashes');
  if (!j.label) p.push('label is required');
  if (!j.company?.name) p.push('company.name is required');
  if (!Array.isArray(j.operatingModel?.roles) || !j.operatingModel.roles.length) p.push('operatingModel.roles must list at least one role');
  if (!Array.isArray(j.maturityStages) || j.maturityStages.length !== 4) p.push('maturityStages must have four stages');
  ['customerSegments', 'customerObjectives', 'lifecycle', 'kpis', 'dataSources'].forEach((k) => { if (!Array.isArray(j[k])) p.push(`${k} must be a list`); });
  if (!j.signals || !Array.isArray(j.signals.adoption) || !Array.isArray(j.signals.engagement)) p.push('signals.adoption and signals.engagement must be lists');
  if (JSON.stringify(j).length > 20000) p.push('profile is larger than 20 KB');
  return p;
}
