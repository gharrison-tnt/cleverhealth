import { h, mount, money, chip, statusChip, cap, basisLabel, toast } from '../ui.js';
import * as data from '../data.js';
import { quadrantChart } from './portfolio.js';

const TABS = [
  ['health', 'Customer Health'],
  ['value', 'Value Realization'],
  ['evidence', 'Evidence & Gaps'],
  ['actions', 'Actions'],
  ['summary', 'Executive Summary'],
];

const QUADRANT_TEXT = {
  highHealth_highValue: 'Relationship and value are both strong. Protect it, capture the proof, and expand.',
  highHealth_lowValue: 'The relationship is carrying this account, but business value is not proven. Usage and goodwill rarely survive a budget review on their own.',
  lowHealth_highValue: 'The customer is getting real value, but the relationship around it is weak. Without a sponsor who has seen the results, the value can go unclaimed at renewal.',
  lowHealth_lowValue: 'Neither the relationship nor the value is established. Intervene now.',
};

export async function renderAccount(main, id, tab = 'health') {
  const acc = data.account(id);
  if (!acc) { mount(main, h('p', null, 'Account not found. ', h('a', { href: '#/' }, 'Back to portfolio'))); return; }
  const r = await data.evaluate(acc);
  if (!r) { mount(main, h('p', null, 'No assessment for this account yet. ', h('a', { href: '#/assess' }, 'Run one'))); return; }
  if (!TABS.some(([k]) => k === tab)) tab = 'health';
  const labels = indicatorLabels(r);

  mount(main, header(r), tabs(acc.id, tab));
  const body = h('div', null);
  mount(main, body);
  ({ health: healthTab, value: valueTab, evidence: evidenceTab, actions: actionsTab, summary: summaryTab })[tab](body, r, labels);
}

function indicatorLabels(r) {
  const m = {};
  r.health.pillars.forEach((p) => p.indicators.forEach((i) => { m[i.id] = i.label; }));
  r.value.dimensions.forEach((d) => { m[d.id] = d.label; });
  return m;
}

function header(r) {
  const a = r.account; const p = r.profile; const ex = r.extraction;
  const isLive = ex.source === 'live';
  const hasOverride = !!data.state.local.assessments[a.id] && !!a.assessment;
  const go = (t) => () => { location.hash = `#/account/${a.id}/${t}`; };

  const rerun = async (btn) => {
    let transcript = ex.transcript;
    if (!transcript && a.transcript) transcript = await data.getText(a.transcript);
    if (!transcript) { toast('No transcript stored for this account.'); return; }
    btn.disabled = true; btn.textContent = 'Running live assessment...';
    try {
      const fresh = await data.runLive({ profile: p, account: a, transcript });
      data.saveAssessment(a.id, fresh);
      toast('Live assessment complete. Scores recalculated.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Re-run live';
      toast(`Live assessment unavailable: ${e.message}`);
    }
  };

  return h('div', null,
    h('div', { class: 'notice' }, p.isExample ? `Fictional demonstration data. ${p.exampleNote}` : 'Fictional demonstration data. All people, companies, and figures are invented.'),
    h('a', { href: '#/', class: 'small muted no-print', style: 'text-decoration:none' }, '← Portfolio'),
    h('div', { class: 'account-head', style: 'margin-top:10px' },
      h('div', null,
        h('div', { class: 'eyebrow' }, [a.scenario ? `Scenario ${a.scenario}` : 'Custom account', a.scenarioLabel].filter(Boolean).join(' · ')),
        h('h2', { class: 'display' }, a.name),
        h('div', { class: 'meta-line' },
          h('span', null, a.industry), a.size ? h('span', null, a.size) : null, h('span', null, a.segment || ''),
          h('span', null, `${money(a.contractValue)} ARR`), h('span', null, a.monthsToRenewal != null ? `Renews in ${a.monthsToRenewal} months` : 'Renewal unknown'),
          h('span', null, `Profile: ${p.label}`))),
      h('div', { class: 'lens-tiles' },
        lensTile('Customer Health', r.health.score, r.health.status, r.health.overallStatus, go('health')),
        lensTile('Value Realization', r.value.score, r.value.status, statusWordValue(r.value.status), go('value')))),
    h('div', { class: 'badge-row' },
      h('span', { class: 'archetype', title: r.health.archetype.description }, r.health.archetype.label),
      chip(r.quadrant.label, 'outline'),
      chip(`Confidence: ${r.health.confidence}`, 'outline'),
      chip(`Renewal risk: ${r.health.renewalRisk}`, r.health.renewalRisk === 'High' ? 'red' : r.health.renewalRisk === 'Elevated' ? 'yellow' : 'outline'),
      chip(isLive ? `Live assessment · ${new Date(ex.generatedAt).toLocaleString()}` : 'Saved assessment', isLive ? 'stated' : ''),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn', onclick: (e) => rerun(e.currentTarget) }, 'Re-run live'),
      hasOverride ? h('button', { class: 'btn ghost', onclick: () => { data.restoreSaved(a.id); toast('Saved assessment restored.'); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, 'Restore saved') : null));
}

const statusWordValue = (s) => ({ green: 'Value proven', yellow: 'Value emerging', red: 'Value unproven' }[s] || 'Unknown');

function lensTile(l, v, st, s, onclick) {
  return h('div', { class: `card lens-tile ${st}`, style: 'cursor:pointer', onclick },
    h('div', { class: 'l' }, l), h('div', { class: 'v' }, String(v)), h('div', { class: 's' }, s));
}

function tabs(id, active) {
  return h('nav', { class: 'tabs no-print' }, TABS.map(([k, label]) => h('a', { class: `tab${k === active ? ' active' : ''}`, href: `#/account/${id}/${k}` }, label)));
}

function card(title, ...body) { return h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'card-head' }, title), ...body); }

// ── HEALTH ─────────────────────────────────────────────
function healthTab(el, r) {
  const hm = data.state.healthModel;
  mount(el, 
    h('div', { class: 'grid g4' }, r.health.pillars.map((p) => {
      const strong = p.indicators.filter((i) => i.level === 'strong').length;
      const unknown = p.indicators.filter((i) => i.level === 'unknown').length;
      return h('div', { class: `card score-card ${p.status}` },
        h('div', { class: 'l' }, p.label),
        h('div', { class: 'v' }, p.score ?? '–'),
        statusChip(p.status),
        h('div', { class: 'n' }, `${strong} of ${p.indicators.length} indicators strong${unknown ? ` · ${unknown} unknown` : ''}`),
        h('div', { class: 'w' }, `Weight ${Math.round(p.weight * 100)}%`));
    })),
    h('div', { class: 'card overall-bar' },
      h('span', null, 'Overall ', h('strong', null, `${r.health.score} · ${r.health.overallStatus}`)),
      h('span', { class: 'muted' }, `${r.health.greens} green, ${r.health.reds} red. Healthy = ${hm.overall.healthyRule.toLowerCase()}. At risk = ${hm.overall.atRiskRule.toLowerCase()}.`)),
    h('div', { style: 'height:16px' }),
    card('If nothing changes', h('div', { class: 'card-pad' }, h('div', { class: `callout ${r.extraction.projection?.direction || 'neutral'}` }, r.extraction.projection?.text || ''))),
    h('div', { class: 'grid g2', style: 'align-items:start' },
      card('Risks', h('div', { class: 'card-pad list' }, sortSev(r.extraction.risks || []).map((x) => h('div', { class: `item ${x.severity}` }, h('div', { class: 'grow' }, x.text, h('div', { class: 'chips' }, chip(cap(x.severity)), chip(pillarName(r, x.pillar), 'outline'), chip(basisLabel(x.basis), x.basis))))))),
      card('Opportunities', h('div', { class: 'card-pad list' }, (r.extraction.opportunities || []).map((x) => h('div', { class: 'item positive' }, h('div', { class: 'grow' }, x.text, h('div', { class: 'chips' }, chip(pillarName(r, x.pillar), 'outline'), chip(basisLabel(x.basis), x.basis)))))))),
    card('Key player map', h('div', { class: 'card-pad grid g3' }, (r.extraction.keyPlayers || []).map(playerCard))),
    maturityCard(r),
    h('div', { class: 'section-title' }, h('span', null, 'Why these scores'), h('span', { class: 'muted', style: 'text-transform:none;letter-spacing:0;font-weight:500' }, 'AI extracts the evidence. Rules calculate the score.')),
    card('Indicator evidence', h('div', { class: 'ind-list' }, r.health.pillars.flatMap((p) => [
      h('div', { style: 'padding:10px 20px;background:var(--paper);border-bottom:1px solid var(--rule);font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--ink-soft)' }, `${p.label} · ${p.score}`),
      ...p.indicators.map(indicatorRow)]))),
  );
}

const sortSev = (xs) => [...xs].sort((a, b) => ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity));
function pillarName(r, id) { return id === 'value' ? 'Value' : (r.health.byId[id]?.label || id); }

function indicatorRow(i) {
  const unknownNote = i.level === 'unknown' ? (i.unknownTreatment === 'absent' ? 'Not evidenced. Scored as absent for this pillar.' : 'Not evidenced. Excluded from this pillar score.') : '';
  return h('div', { class: 'ind' },
    h('div', null, h('div', { class: 'ind-label' }, i.label), h('div', { class: 'ind-def' }, i.definition)),
    h('div', { class: 'ind-level' }, h('span', { class: `chip lvl-${i.level}` }, cap(i.level)), h('span', { class: `chip ${i.basis}` }, basisLabel(i.basis))),
    h('div', { class: 'ind-evidence' }, i.evidence || unknownNote, i.evidence && unknownNote ? h('div', { class: 'small muted' }, unknownNote) : null, i.quote ? h('div', { class: 'ind-quote' }, `“${i.quote}”`) : null),
    h('div', { class: 'ind-points', title: 'Points' }, i.counted ? String(i.points) : '–'));
}

function maturityCard(r) {
  const stages = r.profile.maturityStages; const cur = r.extraction.maturity?.stage || 1;
  return card(h('span', null, 'Customer maturity'),
    h('div', { class: 'card-pad' },
      h('div', { class: 'stages' }, stages.map((s) => h('div', { class: `stage${s.stage === cur ? ' active' : s.stage < cur ? ' past' : ''}` }, h('div', { class: 'k' }, `Stage ${s.stage}`), h('div', { class: 't' }, s.name), h('div', { class: 'd' }, s.definition)))),
      h('p', { class: 'narrative' }, r.extraction.maturity?.rationale || ''),
      h('p', { class: 'small muted', style: 'margin-top:6px' }, 'Stage is AI-assessed against the profile’s stage definitions.')));
}

function playerCard(p) {
  return h('div', { class: `player${p.missing ? ' missing' : ''}` },
    h('div', { class: 'r' }, `${p.role} · ${cap(p.side)}`),
    h('div', { class: 'nm' }, p.name),
    h('div', { class: 'tt' }, p.title),
    h('div', { style: 'margin-top:6px' }, chip(p.missing ? 'Missing' : cap(p.stance), p.missing ? 'red' : p.stance === 'engaged' ? 'green' : p.stance === 'departed' ? 'red' : 'outline')),
    p.note ? h('div', { class: 'nt' }, p.note) : null);
}

// ── VALUE ──────────────────────────────────────────────
function valueTab(el, r) {
  const term = r.profile.terminology || {};
  const ex = r.extraction; const a = r.account;
  const objName = Object.fromEntries((ex.objectives || []).map((o) => [o.id, o.text]));
  mount(el, 
    h('div', { class: 'card lens-compare', style: 'margin-bottom:16px' },
      h('div', null, h('div', { class: 'eyebrow', style: 'color:var(--ink-muted)' }, 'Customer health'), h('div', { class: 'display', style: 'font-family:DM Serif Display,serif;font-size:34px' }, String(r.health.score)), statusChip(r.health.status, r.health.overallStatus)),
      h('div', null, h('div', { class: 'eyebrow', style: 'color:var(--ink-muted)' }, 'Value realization'), h('div', { style: 'font-family:DM Serif Display,serif;font-size:34px' }, String(r.value.score)), statusChip(r.value.status, statusWordValue(r.value.status))),
      h('div', null, h('div', { class: 'eyebrow' }, r.quadrant.label), h('p', { class: 'narrative' }, QUADRANT_TEXT[r.quadrant.key]))),
    h('div', { class: 'grid g5' }, r.value.dimensions.map((d) => h('div', { class: `card score-card ${d.status}` },
      h('div', { class: 'l' }, d.label), h('div', { class: 'v' }, String(d.score)), statusChip(d.status),
      h('div', { class: 'n' }, d.method === 'indicator' ? `${cap(d.level)} · ${basisLabel(d.basis)}` : d.detail),
      h('div', { class: 'w' }, `Weight ${Math.round(d.weight * 100)}%`)))),
    h('div', { class: 'section-title' }, h('span', null, 'Objectives and KPIs')),
    card('From business objective to measured outcome', h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ['Objective', 'KPI', 'Baseline', 'Target', 'Current', 'Status', 'Source'].map((t) => h('th', null, t)))),
      h('tbody', null, (ex.kpis || []).length ? ex.kpis.map((k) => h('tr', null,
        h('td', { class: 'small' }, objName[k.objective] || 'Not linked'),
        h('td', null, h('div', { style: 'font-weight:600' }, k.name), k.note ? h('div', { class: 'small muted' }, k.note) : null),
        cell(k.baseline), cell(k.target), cell(k.current),
        h('td', null, chip(k.measurement === 'measured' ? 'Measured' : k.measurement === 'estimated' ? 'Estimate' : 'Not measured', k.measurement === 'measured' ? 'green' : k.measurement === 'estimated' ? 'yellow' : 'red')),
        h('td', { class: 'small muted' }, k.source || ''))) : h('tr', null, h('td', { colspan: 7, class: 'muted' }, 'No KPIs identified in the evidence.')))))),
    (ex.objectives || []).filter((o) => !(ex.kpis || []).some((k) => k.objective === o.id)).length
      ? h('div', { class: 'callout uncertain', style: 'margin-bottom:16px' }, 'Objectives with no KPI: ', ex.objectives.filter((o) => !(ex.kpis || []).some((k) => k.objective === o.id)).map((o) => o.text).join('; '))
      : null,
    h('div', { class: 'grid g2', style: 'align-items:start' },
      card(term.useCases || 'Use cases', h('div', { class: 'card-pad list' }, (ex.useCases || []).map((u) => h('div', { class: `item ${u.status === 'blocked' ? 'high' : ['live', 'adopted'].includes(u.status) ? 'low' : 'medium'}` },
        h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, u.name), h('div', { class: 'small muted' }, u.evidence)),
        chip(cap(u.status.replace('_', ' ')), u.status === 'blocked' ? 'red' : ['live', 'adopted'].includes(u.status) ? 'green' : 'yellow'))))),
      card('Investment', h('div', { class: 'card-pad' },
        h('div', { class: 'grid g2' },
          h('div', null, h('div', { class: 'small muted' }, 'Annual subscription'), h('div', { style: 'font-family:DM Serif Display,serif;font-size:24px' }, money(a.contractValue))),
          h('div', null, h('div', { class: 'small muted' }, 'Services'), h('div', { style: 'font-family:DM Serif Display,serif;font-size:24px' }, a.servicesValue ? money(a.servicesValue) : 'Unknown'))),
        a.investmentNotes ? h('p', { class: 'small', style: 'margin-top:12px;color:var(--ink-soft)' }, a.investmentNotes) : null,
        h('p', { class: 'small muted', style: 'margin-top:12px' }, `Lifecycle stage: ${a.lifecycleStage || 'Unknown'}`)))),
    card('Value narrative (stated facts only)', h('div', { class: 'card-pad' },
      h('div', { class: 'list' }, (ex.valueNarrative?.statedFacts || []).map((f) => h('div', { class: 'item low' }, h('div', { class: 'grow' }, f)))),
      h('p', { class: 'narrative', style: 'margin-top:14px;font-style:italic' }, ex.valueNarrative?.draft || ''),
      (ex.valueNarrative?.caveats || []).length ? h('div', { class: 'callout uncertain', style: 'margin-top:12px' }, h('strong', null, 'Caveats: '), ex.valueNarrative.caveats.join(' ')) : null)),
  );
}
function cell(v) { return h('td', null, v ? v : h('span', { class: 'chip none' }, 'Missing')); }

// ── EVIDENCE ───────────────────────────────────────────
function evidenceTab(el, r) {
  const valueInd = r.value.dimensions.filter((d) => d.method === 'indicator').map((d) => ({ ...d, evidence: d.detail, counted: true, points: d.score, level: d.level }));
  const all = [...r.health.pillars.flatMap((p) => p.indicators), ...valueInd];
  const counts = { stated: 0, inferred: 0, account: 0, none: 0 };
  all.forEach((i) => { counts[i.basis] = (counts[i.basis] || 0) + 1; });
  mount(el, 
    card('Situation', h('div', { class: 'card-pad' }, h('p', { class: 'narrative' }, r.extraction.summary || ''),
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        chip(`${counts.stated} stated`, 'stated'), chip(`${counts.account} from account data`, 'account'), chip(`${counts.inferred} inferred`, 'inferred'), chip(`${counts.none} no evidence`, 'none')))),
    r.problems.length ? card('Extraction checks', h('div', { class: 'card-pad list' }, r.problems.map((x) => h('div', { class: 'item medium' }, h('div', { class: 'grow' }, x))))) : null,
    card('Return with these answers', h('div', { class: 'card-pad list' }, (r.extraction.missingInformation || []).map((m) => h('div', { class: 'item medium' },
      h('span', { style: 'color:var(--amber);font-weight:700' }, '?'),
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, m.question), h('div', { class: 'small muted' }, m.why)))))),
    (r.extraction.assumptions || []).length ? card('Assumptions (inferred, not stated)', h('div', { class: 'card-pad list' }, r.extraction.assumptions.map((x) => h('div', { class: 'item' }, h('div', { class: 'grow' }, x))))) : null,
    card('All indicators', h('div', { class: 'ind-list' }, all.map(indicatorRow))),
    transcriptBlock(r),
  );
}

function transcriptBlock(r) {
  const d = h('details', { class: 'transcript card' }, h('summary', null, `View source transcript${r.account.transcriptLabel ? `: ${r.account.transcriptLabel}` : ''}`));
  const pre = h('pre', null, 'Loading...');
  d.append(pre);
  d.addEventListener('toggle', async () => {
    if (!d.open || pre.dataset.loaded) return;
    try { pre.textContent = r.extraction.transcript || (r.account.transcript ? await data.getText(r.account.transcript) : 'No transcript stored.'); pre.dataset.loaded = '1'; } catch (e) { pre.textContent = e.message; }
  });
  return d;
}

// ── ACTIONS ────────────────────────────────────────────
function actionsTab(el, r, labels) {
  const roles = Object.fromEntries(r.profile.operatingModel.roles.map((x) => [x.label, x]));
  const acts = [...(r.extraction.actions || [])].sort((a, b) => ['high', 'medium', 'low'].indexOf(a.priority) - ['high', 'medium', 'low'].indexOf(b.priority));
  const byRole = {};
  acts.forEach((a) => { byRole[a.ownerRole] = (byRole[a.ownerRole] || 0) + 1; });
  mount(el, 
    h('div', { class: 'grid actions-grid' },
      card(r.profile.terminology?.actionPlan || 'Action Plan', h('div', { class: 'card-pad list' }, acts.map((a, i) => h('div', { class: 'action' },
        h('div', { class: 'action-num' }, String(i + 1)),
        h('div', null,
          h('div', { class: 'action-title' }, a.action),
          h('div', { class: 'action-detail' }, a.detail),
          h('div', { class: 'action-meta' },
            h('span', { class: `chip side-${roles[a.ownerRole]?.side || 'vendor'}` }, a.ownerRole),
            chip(a.timeframe, 'yellow'),
            a.priority === 'high' ? chip('High priority', 'red') : chip(`${cap(a.priority)} priority`, 'outline'),
            ...(a.addresses || []).map((id) => chip(`Closes: ${labels[id] || id}`, 'outline')))))))),
      h('div', null,
        card('Ownership', h('div', { class: 'card-pad' },
          h('p', { class: 'small muted', style: 'margin-bottom:10px' }, r.profile.operatingModel.summary),
          h('table', { class: 'data' }, h('tbody', null, r.profile.operatingModel.roles.map((ro) => h('tr', null,
            h('td', null, h('div', { style: 'font-weight:600' }, ro.label), h('div', { class: 'small muted' }, ro.owns)),
            h('td', { style: 'text-align:right;font-weight:700' }, String(byRole[ro.label] || 0)))))))),
        card('Where on the map', h('div', { class: 'card-pad' }, quadrantChart([r], data.state.valueModel))))),
  );
}

// ── EXECUTIVE SUMMARY ──────────────────────────────────
function summaryTab(el, r) {
  const ex = r.extraction; const a = r.account;
  const topRisks = sortSev(ex.risks || []).slice(0, 3);
  const topActions = [...(ex.actions || [])].sort((x, y) => ['high', 'medium', 'low'].indexOf(x.priority) - ['high', 'medium', 'low'].indexOf(y.priority)).slice(0, 4);
  mount(el, h('div', { class: 'card card-pad exec' },
    h('div', { class: 'btn-row no-print', style: 'justify-content:flex-end;margin-bottom:8px' }, h('button', { class: 'btn', onclick: () => window.print() }, 'Print or save as PDF')),
    h('div', { class: 'eyebrow' }, 'Executive summary · Fictional demonstration data'),
    h('h2', { class: 'display' }, a.name),
    h('p', { class: 'small muted' }, `${a.industry} · ${money(a.contractValue)} ARR · Renews in ${a.monthsToRenewal ?? '?'} months · Assessed ${ex.source === 'live' ? new Date(ex.generatedAt).toLocaleDateString() : ex.generatedAt}`),
    h('div', { class: 'grid g3', style: 'margin-top:18px' },
      lensTile('Customer Health', r.health.score, r.health.status, r.health.overallStatus, null),
      lensTile('Value Realization', r.value.score, r.value.status, statusWordValue(r.value.status), null),
      h('div', { class: 'card lens-tile' }, h('div', { class: 'l' }, 'Pattern'), h('div', { style: 'font-weight:700;font-size:16px;margin-top:4px' }, r.health.archetype.label), h('div', { class: 's' }, r.quadrant.label))),
    h('h3', null, 'Situation'), h('p', { class: 'narrative' }, ex.summary),
    h('h3', null, 'Pillar scores'),
    h('ul', null, r.health.pillars.map((p) => h('li', null, `${p.label}: ${p.score} (${p.status})`)), r.value.dimensions.map((d) => h('li', null, `${d.label}: ${d.score} (${d.status})`))),
    h('h3', null, 'Top risks'), h('ul', null, topRisks.map((x) => h('li', null, x.text))),
    h('h3', null, 'Priority actions'), h('ul', null, topActions.map((x) => h('li', null, `${x.action} (${x.ownerRole}, ${x.timeframe})`))),
    h('h3', null, 'Value story'), h('p', { class: 'narrative' }, ex.valueNarrative?.draft || ''),
    h('h3', null, 'To validate before relying on this'), h('ul', null, (ex.missingInformation || []).slice(0, 4).map((m) => h('li', null, m.question))),
    h('h3', null, 'If nothing changes'), h('p', { class: 'narrative' }, ex.projection?.text || ''),
    h('p', { class: 'small muted', style: 'margin-top:20px' }, `Scores calculated by CleverHealth rules (${data.state.healthModel.id}, ${data.state.valueModel.id}) from AI-extracted evidence. Confidence: ${r.health.confidence}.`)));
}
