import { assess, resolveSpec } from './scoring.js';
import * as store from './store.js';

const cache = new Map();
async function getJSON(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.json(); }));
  return cache.get(path);
}
export async function getText(path) {
  const key = `text:${path}`;
  if (!cache.has(key)) cache.set(key, fetch(path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.text(); }));
  return cache.get(key);
}

export const state = { index: null, healthModel: null, valueModel: null, profiles: {}, seedAccounts: [], local: store.load() };

export async function init() {
  state.index = await getJSON('config/profiles/index.json');
  const [hm, vm, acc] = await Promise.all([getJSON(state.index.scoring.health), getJSON(state.index.scoring.value), getJSON(state.index.demo.accounts)]);
  state.healthModel = hm; state.valueModel = vm; state.seedAccounts = acc.accounts; state.notice = acc.notice;
  const loaded = await Promise.all(state.index.profiles.map((p) => getJSON(p.path).then((j) => ({ ...j, hidden: p.hidden || j.hidden }))));
  loaded.forEach((p) => { state.profiles[p.id] = p; });
  (state.local.customProfiles || []).forEach((p) => { state.profiles[p.id] = { ...p, custom: true }; });
}

export function visibleProfiles() {
  const forced = new URLSearchParams(location.search).get('profile');
  return Object.values(state.profiles).filter((p) => !p.hidden || p.id === forced);
}

export function defaultProfileId() {
  const forced = new URLSearchParams(location.search).get('profile');
  return (forced && state.profiles[forced]) ? forced : state.index.default;
}

export function accounts() { return [...state.seedAccounts, ...(state.local.customAccounts || [])]; }
export function account(id) { return accounts().find((a) => a.id === id); }
export function profileFor(acc) { return state.profiles[acc.profileId] || state.profiles[state.index.default]; }

export async function extractionFor(acc) {
  const local = state.local.assessments[acc.id];
  if (local) return local;
  if (acc.assessment) return getJSON(acc.assessment);
  return null;
}

export async function evaluate(acc) {
  const extraction = await extractionFor(acc);
  if (!extraction) return null;
  const profile = profileFor(acc);
  const r = assess({ healthModel: state.healthModel, valueModel: state.valueModel, profile, account: acc, extraction });
  return { ...r, extraction, profile, account: acc };
}

export function specFor(profile) { return resolveSpec(state.healthModel, state.valueModel, profile); }

export function saveAssessment(accountId, extraction) {
  state.local.assessments[accountId] = extraction; store.save(state.local);
}
export function restoreSaved(accountId) { delete state.local.assessments[accountId]; store.save(state.local); }
export function addAccount(acc) { state.local.customAccounts = [...(state.local.customAccounts || []).filter((a) => a.id !== acc.id), acc]; store.save(state.local); }
export function addProfile(p) {
  state.local.customProfiles = [...(state.local.customProfiles || []).filter((x) => x.id !== p.id), p];
  state.profiles[p.id] = { ...p, custom: true }; store.save(state.local);
}
export function resetDemo() {
  state.local = store.reset();
  Object.keys(state.profiles).forEach((k) => { if (state.profiles[k].custom) delete state.profiles[k]; });
}

export async function runLive({ profile, account: acc, transcript }) {
  const spec = specFor(profile);
  const slimProfile = {
    company: profile.company, customerObjectives: profile.customerObjectives, lifecycle: profile.lifecycle,
    signals: profile.signals, dataSources: profile.dataSources, operatingModel: { summary: profile.operatingModel?.summary },
    assessmentGuidance: profile.assessmentGuidance,
  };
  const slimSpec = { transcriptIndicators: spec.transcriptIndicators, roles: spec.roles, maturityStages: spec.maturityStages, terminology: spec.terminology };
  const accountData = {
    name: acc.name, industry: acc.industry, segment: acc.segment, size: acc.size, contractValue: acc.contractValue,
    servicesValue: acc.servicesValue, monthsToRenewal: acc.monthsToRenewal, daysSinceExecContact: acc.daysSinceExecContact,
    utilizationPct: acc.utilizationPct, lifecycleStage: acc.lifecycleStage, investmentNotes: acc.investmentNotes,
  };
  const res = await fetch('/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: slimProfile, spec: slimSpec, account: accountData, transcript }) });
  const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
  if (!res.ok || data.error) throw new Error(data.error || `Server returned ${res.status}`);
  return { ...data.extraction, transcript };
}
