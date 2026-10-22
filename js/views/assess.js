import { h, mount } from '../ui.js';
import * as data from '../data.js';

const STEPS = ['Reading the company profile...', 'Extracting evidence for each indicator...', 'Separating stated facts from inferences...', 'Mapping objectives, KPIs, and use cases...', 'Assigning actions to owners...', 'Calculating scores by rule...'];

export function renderAssess(main) {
  const profiles = data.visibleProfiles();
  let profileId = data.defaultProfileId();
  const st = { accountId: '__new' };

  const profileSel = h('select', { id: 'profileSel' }, profiles.map((p) => h('option', { value: p.id, selected: p.id === profileId }, p.label)));
  const accountSel = h('select', { id: 'accountSel' });
  const fields = {
    name: input('text', 'e.g. Northwind Outfitters'), industry: input('text', 'e.g. Specialty retail'), segment: input('text', 'e.g. Enterprise'),
    contractValue: input('number', 'e.g. 450000'), monthsToRenewal: input('number', 'e.g. 6'), daysSinceExecContact: input('number', 'e.g. 30'), utilizationPct: input('number', 'e.g. 65'),
  };
  const transcript = h('textarea', { id: 'transcript', placeholder: 'Paste a call transcript, QBR notes, or meeting notes. At least a few exchanges.' });
  const count = h('span', { class: 'small muted' }, '0 characters');
  transcript.addEventListener('input', () => { count.textContent = `${transcript.value.length.toLocaleString()} characters`; });
  const samples = h('div', { class: 'btn-row' });
  const errorBox = h('div');
  const runBtn = h('button', { class: 'btn primary', onclick: run }, 'Run assessment');
  const loading = h('div', { class: 'loading', style: 'display:none' }, h('div', { class: 'spinner' }), h('div', { class: 'loading-step' }, STEPS[0]));
  const accountFields = h('div', { class: 'form-grid', style: 'margin-top:14px' },
    field('Account name', fields.name), field('Industry', fields.industry), field('Segment', fields.segment),
    field('Annual contract value (USD)', fields.contractValue), field('Months to renewal', fields.monthsToRenewal),
    field('Days since executive contact', fields.daysSinceExecContact, 'VP or above, or the named sponsor'),
    field('Utilization %', fields.utilizationPct, 'Active vs licensed or entitled. Leave blank if unknown.'));

  function refresh() {
    const p = data.state.profiles[profileId];
    accountSel.replaceChildren(h('option', { value: '__new' }, 'New account'), ...data.accounts().filter((a) => a.profileId === profileId).map((a) => h('option', { value: a.id, selected: a.id === st.accountId }, `${a.name}${a.fictional ? ' (fictional demo)' : ''}`)));
    if (![...accountSel.options].some((o) => o.value === st.accountId)) st.accountId = '__new';
    accountSel.value = st.accountId;
    const acc = data.account(st.accountId);
    Object.entries(fields).forEach(([k, el]) => { el.value = acc ? (acc[k] ?? '') : ''; el.disabled = !!acc; });
    samples.replaceChildren(...(p.sampleTranscripts || []).map((s) => h('button', { class: 'btn ghost', onclick: async () => {
      transcript.value = await data.getText(s.path); transcript.dispatchEvent(new Event('input'));
      if (s.accountId && data.account(s.accountId)) { st.accountId = s.accountId; refresh(); }
    } }, `Load sample: ${s.label}`)));
  }
  profileSel.addEventListener('change', () => { profileId = profileSel.value; st.accountId = '__new'; refresh(); });
  accountSel.addEventListener('change', () => { st.accountId = accountSel.value; refresh(); });

  async function run() {
    errorBox.replaceChildren();
    const text = transcript.value.trim();
    if (text.length < 200) { errorBox.append(h('div', { class: 'error-box' }, 'Paste a transcript of at least 200 characters.')); return; }
    let acc = data.account(st.accountId);
    if (!acc) {
      if (!fields.name.value.trim()) { errorBox.append(h('div', { class: 'error-box' }, 'Give the new account a name.')); return; }
      const num = (el) => (el.value === '' ? null : Number(el.value));
      acc = {
        id: `custom-${fields.name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now().toString(36)}`,
        name: fields.name.value.trim(), industry: fields.industry.value.trim() || 'Not specified', segment: fields.segment.value.trim(),
        contractValue: num(fields.contractValue), monthsToRenewal: num(fields.monthsToRenewal), daysSinceExecContact: num(fields.daysSinceExecContact), utilizationPct: num(fields.utilizationPct),
        profileId, custom: true,
      };
    }
    runBtn.disabled = true; loading.style.display = 'block';
    let i = 0; const timer = setInterval(() => { i = Math.min(i + 1, STEPS.length - 1); loading.lastChild.textContent = STEPS[i]; }, 2500);
    try {
      const extraction = await data.runLive({ profile: data.state.profiles[profileId], account: acc, transcript: text });
      if (acc.custom) data.addAccount(acc);
      data.saveAssessment(acc.id, extraction);
      location.hash = `#/account/${acc.id}/health`;
    } catch (e) {
      errorBox.append(h('div', { class: 'error-box' }, `Live assessment failed: ${e.message}. The saved demo assessments still work from the portfolio.`));
    } finally { clearInterval(timer); runBtn.disabled = false; loading.style.display = 'none'; }
  }

  mount(main, 
    h('a', { href: '#/', class: 'small muted', style: 'text-decoration:none' }, '← Portfolio'),
    h('div', { class: 'eyebrow', style: 'margin-top:12px' }, 'New assessment'),
    h('h2', { class: 'display', style: 'margin-bottom:8px' }, 'Assess an account from a conversation'),
    h('p', { class: 'lede', style: 'margin-bottom:22px' }, 'Pick a company profile, add the account record, and paste a transcript. The AI extracts evidence against the profile’s indicators; CleverHealth’s rules calculate every score.'),
    h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'card-head' }, '1 · Company profile and account'),
      h('div', { class: 'card-pad' },
        h('div', { class: 'form-grid' }, field('Company profile', profileSel, 'Sets terminology, indicators, roles, and maturity stages'), field('Account', accountSel)),
        accountFields)),
    h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'card-head' }, '2 · Transcript or meeting notes', count),
      h('div', { class: 'card-pad' }, transcript, h('div', { style: 'margin-top:10px' }, samples))),
    h('div', { class: 'card card-pad' },
      h('div', { class: 'btn-row' }, runBtn, h('span', { class: 'small muted' }, 'Takes 20 to 40 seconds. Results are saved in this browser only.')),
      loading, errorBox),
  );
  refresh();
}

function input(type, placeholder) { return h('input', { type, placeholder }); }
function field(label, control, hint) { return h('div', { class: 'field' }, h('label', null, label), control, hint ? h('span', { class: 'hint' }, hint) : null); }
