// CleverHealth deterministic scoring engine.
// The AI layer only extracts evidence (levels, quotes, KPIs, use cases).
// Every score, status, archetype, and quadrant below is calculated here by rule.
// Pure functions: runs in the browser and in Node (tests).

const LEVELS = ['strong', 'partial', 'absent', 'unknown'];

export function statusFor(score, thresholds) {
  if (score === null || score === undefined) return 'unknown';
  if (score >= thresholds.green) return 'green';
  if (score >= thresholds.yellow) return 'yellow';
  return 'red';
}

const round = (n) => (n === null || n === undefined ? null : Math.round(n));

// Merge base scoring model with a company profile's label and definition overrides.
export function resolveSpec(healthModel, valueModel, profile) {
  const overrides = profile.indicatorOverrides || {};
  const pillars = healthModel.pillars.map((p) => ({
    ...p,
    indicators: p.indicators.map((i) => ({ ...i, ...(overrides[i.id] || {}), pillar: p.id })),
  }));
  const transcriptIndicators = [];
  pillars.forEach((p) => p.indicators.forEach((i) => {
    if (i.source === 'transcript') transcriptIndicators.push({ id: i.id, label: i.label, definition: i.definition, pillar: p.id });
  }));
  valueModel.dimensions.forEach((d) => {
    if (d.method === 'indicator') {
      const o = overrides[d.id] || {};
      transcriptIndicators.push({ id: d.id, label: o.label || d.label, definition: o.definition || d.definition, pillar: 'value' });
    }
  });
  return {
    pillars,
    transcriptIndicators,
    valueDimensions: valueModel.dimensions.map((d) => ({ ...d, ...(overrides[d.id] || {}) })),
    roles: profile.operatingModel.roles,
    maturityStages: profile.maturityStages,
    terminology: profile.terminology || {},
  };
}

function levelFromRule(rule, account) {
  const v = account ? account[rule.field] : undefined;
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return { level: 'unknown', value: null };
  const n = Number(v);
  for (const b of rule.bands) {
    if (b.max !== undefined && n <= b.max) return { level: b.level, value: n };
    if (b.min !== undefined && n >= b.min) return { level: b.level, value: n };
    if (b.max === undefined && b.min === undefined) return { level: b.level, value: n };
  }
  return { level: 'unknown', value: n };
}

function indexIndicators(extraction) {
  const map = {};
  (extraction.indicators || []).forEach((i) => {
    if (i && i.id) map[i.id] = { ...i, level: LEVELS.includes(i.level) ? i.level : 'unknown' };
  });
  return map;
}

export function scoreHealth(healthModel, spec, account, extraction) {
  const ex = indexIndicators(extraction);
  const pts = healthModel.levels;
  let confNum = 0; let confDen = 0;
  const pillars = spec.pillars.map((p) => {
    let num = 0; let den = 0;
    const indicators = p.indicators.map((ind) => {
      let level; let basis; let evidence = ''; let quote = ''; let value = null;
      if (ind.source === 'account') {
        const r = levelFromRule(ind.rule, account);
        level = r.level; value = r.value;
        basis = level === 'unknown' ? 'none' : 'account';
        evidence = level === 'unknown' ? 'No value in the account record.' : (ind.rule.evidenceTemplate ? ind.rule.evidenceTemplate.replace('{value}', value) : `Account record: ${value}`);
      } else {
        const e = ex[ind.id];
        level = e ? e.level : 'unknown';
        basis = e ? (e.basis || (level === 'unknown' ? 'none' : 'inferred')) : 'none';
        evidence = e ? (e.evidence || '') : '';
        quote = e ? (e.quote || '') : '';
      }
      if (level === 'unknown') basis = 'none';
      const w = ind.weight ?? 1;
      let points = null; let counted = true;
      if (level === 'unknown') {
        if (p.unknownPolicy === 'absent') points = pts.absent; else counted = false;
      } else points = pts[level];
      if (counted) { num += points * w; den += w; }
      confNum += (healthModel.basisConfidence[basis] ?? 0) * w; confDen += w;
      return { ...ind, level, basis, evidence, quote, value, points, counted, unknownTreatment: level === 'unknown' ? p.unknownPolicy : null };
    });
    const score = den > 0 ? num / den : null;
    return { id: p.id, label: p.label, weight: p.weight, unknownPolicy: p.unknownPolicy, score: round(score), status: statusFor(score, healthModel.thresholds), indicators };
  });

  let wNum = 0; let wDen = 0;
  pillars.forEach((p) => { if (p.score !== null) { wNum += p.score * p.weight; wDen += p.weight; } });
  const overallScore = wDen ? wNum / wDen : null;
  const by = Object.fromEntries(pillars.map((p) => [p.id, p]));
  const greens = pillars.filter((p) => p.status === 'green').length;
  const reds = pillars.filter((p) => p.status === 'red').length;
  let overallStatus = 'Watch';
  if (greens >= 3 && reds === 0) overallStatus = 'Healthy';
  if (by.champion?.status === 'red' || by.roi?.status === 'red' || reds >= 2) overallStatus = 'At risk';

  const confidenceRatio = confDen ? confNum / confDen : 0;
  const confidence = confidenceRatio >= 0.7 ? 'High' : confidenceRatio >= 0.45 ? 'Medium' : 'Low';
  const monthsToRenewal = account?.monthsToRenewal ?? null;
  const renewalWindow = monthsToRenewal !== null && monthsToRenewal <= healthModel.overall.renewalWindowMonths;
  const renewalRisk = renewalWindow && overallStatus !== 'Healthy' ? (overallStatus === 'At risk' ? 'High' : 'Elevated') : (renewalWindow ? 'Low' : 'Not in window');

  const result = {
    pillars, byId: by, score: round(overallScore), status: statusFor(overallScore, healthModel.thresholds),
    overallStatus, greens, reds, confidence, confidenceRatio: Math.round(confidenceRatio * 100) / 100, renewalRisk,
  };
  result.archetype = deriveArchetype(healthModel.archetypes, result);
  return result;
}

function matches(when, health) {
  if (when.allPillars && !health.pillars.every((p) => when.allPillars.includes(p.status))) return false;
  if (when.pillarMin) for (const [k, v] of Object.entries(when.pillarMin)) if (!((health.byId[k]?.score ?? -1) >= v)) return false;
  if (when.overall && !when.overall.includes(health.overallStatus)) return false;
  if (when.pillar) for (const [k, v] of Object.entries(when.pillar)) if (!v.includes(health.byId[k]?.status)) return false;
  if (when.indicator) {
    for (const [k, v] of Object.entries(when.indicator)) {
      let lvl = null;
      health.pillars.forEach((p) => p.indicators.forEach((i) => { if (i.id === k) lvl = i.level; }));
      if (!v.includes(lvl)) return false;
    }
  }
  return true;
}

export function deriveArchetype(rules, health) {
  const hit = rules.find((r) => matches(r.when || {}, health)) || rules[rules.length - 1];
  return { id: hit.id, label: hit.label, description: hit.description };
}

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== '' && !/^(unknown|n\/a|none)$/i.test(String(v).trim());

export function scoreValue(valueModel, spec, extraction) {
  const ex = indexIndicators(extraction);
  const kpis = extraction.kpis || [];
  const objectives = extraction.objectives || [];
  const useCases = extraction.useCases || [];
  const absent = valueModel.absentScore;

  const dims = spec.valueDimensions.map((d) => {
    let score = null; let detail = ''; let basis = 'computed';
    if (d.method === 'objectives') {
      if (!objectives.length) { score = absent; detail = 'No business objectives identified.'; } else {
        const measurable = objectives.filter((o) => kpis.some((k) => k.objective === o.id && (hasValue(k.baseline) || hasValue(k.target))));
        score = 30 + 70 * (measurable.length / objectives.length);
        detail = `${measurable.length} of ${objectives.length} objectives have a KPI with a baseline or target.`;
      }
    } else if (d.method === 'kpiBaselines') {
      if (!kpis.length) { score = absent; detail = 'No KPIs identified.'; } else {
        const n = kpis.filter((k) => hasValue(k.baseline)).length;
        score = 100 * (n / kpis.length); detail = `${n} of ${kpis.length} KPIs have a baseline.`;
      }
    } else if (d.method === 'useCaseActivation') {
      if (!useCases.length) { score = absent; detail = 'No use cases identified.'; } else {
        const w = d.statusWeights;
        score = 100 * (useCases.reduce((s, u) => s + (w[u.status] ?? 0), 0) / useCases.length);
        const counts = {};
        useCases.forEach((u) => { counts[u.status] = (counts[u.status] || 0) + 1; });
        detail = Object.entries(counts).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ');
      }
    } else if (d.method === 'kpiMeasurement') {
      if (!kpis.length) { score = absent; detail = 'No KPIs identified.'; } else {
        const w = d.measurementWeights;
        score = 100 * (kpis.reduce((s, k) => s + (w[k.measurement] ?? 0), 0) / kpis.length);
        const m = kpis.filter((k) => k.measurement === 'measured').length;
        const e = kpis.filter((k) => k.measurement === 'estimated').length;
        detail = `${m} measured, ${e} estimated, ${kpis.length - m - e} not measured.`;
      }
    } else if (d.method === 'indicator') {
      const e = ex[d.id];
      const level = e ? e.level : 'unknown';
      score = level === 'unknown' ? absent : d.levels[level];
      basis = level === 'unknown' ? 'none' : (e.basis || 'inferred');
      detail = e?.evidence || 'No evidence in transcript.';
      return { ...d, score: round(score), status: statusFor(score, valueModel.thresholds), detail, level, basis, quote: e?.quote || '' };
    }
    return { ...d, score: round(score), status: statusFor(score, valueModel.thresholds), detail, basis };
  });

  const total = dims.reduce((s, d) => s + d.score * d.weight, 0) / dims.reduce((s, d) => s + d.weight, 0);
  return { dimensions: dims, score: round(total), status: statusFor(total, valueModel.thresholds), kpis, objectives, useCases };
}

export function quadrant(valueModel, healthScore, valueScore) {
  const s = valueModel.quadrant.split; const L = valueModel.quadrant.labels;
  const hh = healthScore >= s; const hv = valueScore >= s;
  const key = `${hh ? 'highHealth' : 'lowHealth'}_${hv ? 'highValue' : 'lowValue'}`;
  return { key, label: L[key] };
}

// Validate an extraction against the spec. Returns a list of problems (empty = clean).
export function validateExtraction(spec, extraction) {
  const problems = [];
  const ids = new Set(spec.transcriptIndicators.map((i) => i.id));
  const roles = new Set(spec.roles.map((r) => r.label));
  (extraction.indicators || []).forEach((i) => {
    if (!ids.has(i.id)) problems.push(`Unknown indicator id: ${i.id}`);
    if (!LEVELS.includes(i.level)) problems.push(`Bad level on ${i.id}`);
    if (i.level !== 'unknown' && !i.evidence) problems.push(`No evidence on ${i.id}`);
    if (i.level === 'unknown' && i.basis && i.basis !== 'none') problems.push(`Unknown indicator ${i.id} must have basis none`);
  });
  ids.forEach((id) => { if (!(extraction.indicators || []).some((i) => i.id === id)) problems.push(`Missing indicator: ${id}`); });
  (extraction.actions || []).forEach((a) => { if (!roles.has(a.ownerRole)) problems.push(`Action owner not in operating model: ${a.ownerRole}`); });
  const objIds = new Set((extraction.objectives || []).map((o) => o.id));
  (extraction.kpis || []).forEach((k) => {
    if (k.objective && !objIds.has(k.objective)) problems.push(`KPI ${k.name} references unknown objective ${k.objective}`);
    if (k.measurement === 'measured' && !hasValue(k.current)) problems.push(`KPI ${k.name} marked measured without a current value`);
  });
  if (!(extraction.missingInformation || []).length) problems.push('No missing information listed');
  return problems;
}

export function assess({ healthModel, valueModel, profile, account, extraction }) {
  const spec = resolveSpec(healthModel, valueModel, profile);
  const health = scoreHealth(healthModel, spec, account, extraction);
  const value = scoreValue(valueModel, spec, extraction);
  return { spec, health, value, quadrant: quadrant(valueModel, health.score, value.score), problems: validateExtraction(spec, extraction) };
}
