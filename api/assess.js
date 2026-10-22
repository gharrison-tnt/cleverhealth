// CleverHealth assessment endpoint.
// The server owns the model, token limit, system prompt, and output schema.
// The browser sends only data: company profile, scoring spec, account record, transcript.
// The model extracts evidence; it never assigns scores. Scoring happens in js/scoring.js.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const MAX_TOKENS = 6000;
const LIMITS = { transcript: 40000, profile: 20000, spec: 20000, account: 4000 };

const str = (v, n = 2000) => (typeof v === 'string' ? v.slice(0, n) : '');
const arr = (v) => (Array.isArray(v) ? v : []);

function buildTool(spec) {
  const indicatorIds = arr(spec.transcriptIndicators).map((i) => str(i.id, 60)).filter(Boolean);
  const roleLabels = arr(spec.roles).map((r) => str(r.label, 80)).filter(Boolean);
  const basis = { type: 'string', enum: ['stated', 'inferred', 'none'] };
  return {
    name: 'submit_assessment',
    description: 'Submit the evidence extraction for this customer account. Do not include scores.',
    input_schema: {
      type: 'object',
      required: ['accountName', 'summary', 'indicators', 'maturity', 'keyPlayers', 'objectives', 'kpis', 'useCases', 'risks', 'opportunities', 'actions', 'valueNarrative', 'projection', 'missingInformation', 'assumptions'],
      properties: {
        accountName: { type: 'string' },
        summary: { type: 'string', description: 'Two sentences on the account situation, grounded in the transcript.' },
        indicators: {
          type: 'array',
          description: 'Exactly one entry per indicator id provided.',
          items: {
            type: 'object', required: ['id', 'level', 'basis', 'evidence', 'quote'],
            properties: {
              id: { type: 'string', enum: indicatorIds },
              level: { type: 'string', enum: ['strong', 'partial', 'absent', 'unknown'] },
              basis,
              evidence: { type: 'string', description: 'Why this level. Empty only when level is unknown.' },
              quote: { type: 'string', description: 'Short verbatim quote from the transcript, or empty.' },
            },
          },
        },
        maturity: { type: 'object', required: ['stage', 'rationale'], properties: { stage: { type: 'integer', minimum: 1, maximum: 4 }, rationale: { type: 'string' } } },
        keyPlayers: {
          type: 'array',
          items: {
            type: 'object', required: ['name', 'title', 'role', 'side', 'stance'],
            properties: {
              name: { type: 'string', description: 'As named in the transcript, or "Not named".' },
              title: { type: 'string' }, role: { type: 'string' },
              side: { type: 'string', enum: ['customer', 'vendor', 'partner'] },
              stance: { type: 'string', enum: ['engaged', 'neutral', 'disengaged', 'departed', 'unknown'] },
              missing: { type: 'boolean', description: 'True if this role matters but was absent or unfilled.' },
              note: { type: 'string' },
            },
          },
        },
        objectives: { type: 'array', items: { type: 'object', required: ['id', 'text', 'basis'], properties: { id: { type: 'string', description: 'obj1, obj2, ...' }, text: { type: 'string' }, basis } } },
        kpis: {
          type: 'array',
          items: {
            type: 'object', required: ['name', 'objective', 'baseline', 'target', 'current', 'measurement', 'source', 'basis'],
            properties: {
              name: { type: 'string' },
              objective: { type: 'string', description: 'Objective id this KPI measures.' },
              baseline: { type: ['string', 'null'], description: 'Only if stated. Otherwise null.' },
              target: { type: ['string', 'null'], description: 'Only if stated. Otherwise null.' },
              current: { type: ['string', 'null'], description: 'Only if stated. Otherwise null.' },
              measurement: { type: 'string', enum: ['measured', 'estimated', 'not_measured'] },
              source: { type: 'string' }, basis, note: { type: 'string' },
            },
          },
        },
        useCases: { type: 'array', items: { type: 'object', required: ['name', 'status', 'evidence'], properties: { name: { type: 'string' }, status: { type: 'string', enum: ['planned', 'in_progress', 'live', 'adopted', 'blocked'] }, evidence: { type: 'string' } } } },
        risks: { type: 'array', items: { type: 'object', required: ['text', 'pillar', 'severity', 'basis'], properties: { text: { type: 'string' }, pillar: { type: 'string', enum: ['champion', 'roi', 'adoption', 'engagement', 'value'] }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, basis } } },
        opportunities: { type: 'array', items: { type: 'object', required: ['text', 'pillar', 'basis'], properties: { text: { type: 'string' }, pillar: { type: 'string', enum: ['champion', 'roi', 'adoption', 'engagement', 'value'] }, basis } } },
        actions: {
          type: 'array',
          items: {
            type: 'object', required: ['action', 'detail', 'ownerRole', 'timeframe', 'priority', 'addresses'],
            properties: {
              action: { type: 'string' }, detail: { type: 'string' },
              ownerRole: { type: 'string', enum: roleLabels },
              timeframe: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              addresses: { type: 'array', items: { type: 'string', enum: indicatorIds } },
            },
          },
        },
        valueNarrative: {
          type: 'object', required: ['statedFacts', 'draft', 'caveats'],
          properties: {
            statedFacts: { type: 'array', items: { type: 'string' }, description: 'Only figures and facts stated in the transcript or account data.' },
            draft: { type: 'string', description: 'Short narrative using only statedFacts. No invented numbers.' },
            caveats: { type: 'array', items: { type: 'string' } },
          },
        },
        projection: { type: 'object', required: ['direction', 'text'], properties: { direction: { type: 'string', enum: ['positive', 'negative', 'uncertain'] }, text: { type: 'string' } } },
        missingInformation: { type: 'array', items: { type: 'object', required: ['question', 'why', 'relatesTo'], properties: { question: { type: 'string' }, why: { type: 'string' }, relatesTo: { type: 'string' } } } },
        assumptions: { type: 'array', items: { type: 'string' } },
      },
    },
  };
}

const SYSTEM = `You are the evidence extraction engine for CleverHealth, a customer health and value realization assessment tool.

Your job is to read a customer conversation and structured account data, and extract evidence. You do not assign numeric scores. A deterministic engine calculates every score from your evidence levels.

Rules:
1. Use only what is in the transcript and account data. Never invent people, numbers, dates, outcomes, or business impact.
2. For every indicator, choose a level: strong, partial, absent, or unknown. Use unknown when the transcript does not give evidence either way. Unknown is better than a guess.
3. Mark basis "stated" when the transcript says it directly, "inferred" when you are reasoning from indirect signals, and "none" only with level unknown.
4. Quotes must be short and verbatim from the transcript. Leave quote empty rather than paraphrasing.
5. KPI baseline, target, and current values must be null unless stated. A platform-reported or self-estimated figure is "estimated", not "measured". A figure is "measured" only if it has a named source the customer trusts.
6. Value narrative uses only statedFacts. Label estimates as estimates.
7. Assign each action to one owner role from the provided operating model. Tie each action to the indicator gaps it addresses.
8. List the specific missing information that would validate or change the assessment.
9. Use the company profile to interpret what adoption, engagement, and value mean for this business. Use the profile's terminology.
10. Plain, direct language. No em dashes.`;

function buildUserMessage({ profile, spec, account, transcript }) {
  const indicators = arr(spec.transcriptIndicators).map((i) => `- ${str(i.id, 60)} [${str(i.pillar, 30)}] ${str(i.label, 120)}: ${str(i.definition, 400)}`).join('\n');
  const roles = arr(spec.roles).map((r) => `- ${str(r.label, 80)} (${str(r.side, 20)}): ${str(r.owns, 200)}`).join('\n');
  const stages = arr(spec.maturityStages).map((s) => `${Number(s.stage)}. ${str(s.name, 60)}: ${str(s.definition, 300)}`).join('\n');
  const c = profile.company || {};
  return `COMPANY PROFILE (the vendor whose customer success team is using this assessment)
Company: ${str(c.name, 200)}
Industry: ${str(c.industry, 200)}
Product category: ${str(c.productCategory, 300)}
Description: ${str(c.description, 800)}
Typical customer objectives: ${arr(profile.customerObjectives).map((x) => str(x, 200)).join('; ')}
Customer lifecycle: ${arr(profile.lifecycle).map((x) => str(x, 60)).join(' > ')}
Adoption signals: ${arr(profile.signals?.adoption).map((x) => str(x, 200)).join('; ')}
Engagement signals: ${arr(profile.signals?.engagement).map((x) => str(x, 200)).join('; ')}
Available data sources: ${arr(profile.dataSources).map((x) => str(x, 100)).join('; ')}
Terminology: use case = "${str(spec.terminology?.useCase, 40) || 'use case'}"
Guidance: ${str(profile.assessmentGuidance, 1500)}

OPERATING MODEL
${str(profile.operatingModel?.summary, 800)}
Owner roles:
${roles}

INDICATORS TO ASSESS (return exactly one entry for each id)
${indicators}

MATURITY STAGES
${stages}

ACCOUNT RECORD (structured data; treat as fact)
${JSON.stringify(account).slice(0, LIMITS.account)}

TRANSCRIPT
${transcript}

Call submit_assessment with your extraction.`;
}

export default async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  const { profile, spec, account, transcript } = body || {};
  if (typeof transcript !== 'string' || transcript.trim().length < 200) return res.status(400).json({ error: 'Transcript must be at least 200 characters.' });
  if (transcript.length > LIMITS.transcript) return res.status(413).json({ error: `Transcript exceeds ${LIMITS.transcript} characters.` });
  if (!profile || !spec || JSON.stringify(profile).length > LIMITS.profile || JSON.stringify(spec).length > LIMITS.spec) return res.status(400).json({ error: 'Missing or oversized profile or spec.' });
  if (!arr(spec.transcriptIndicators).length || !arr(spec.roles).length) return res.status(400).json({ error: 'Spec must include indicators and roles.' });

  const tool = buildTool(spec);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: buildUserMessage({ profile, spec, account: account || {}, transcript }) }],
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || 'Model API error' });
    const block = (data?.content || []).find((b) => b.type === 'tool_use');
    if (!block) return res.status(502).json({ error: 'Model did not return a structured assessment.' });
    return res.status(200).json({ extraction: { schemaVersion: 1, source: 'live', generatedAt: new Date().toISOString(), model: MODEL, ...block.input } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
