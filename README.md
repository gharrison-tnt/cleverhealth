# CleverHealth: Customer Intelligence & Value Realization

Connect customer engagement, technology adoption, and business outcomes to identify risk, accelerate value realization, and drive accountable action.

All customer data in this repository is fictional demonstration data.

## How it works

1. A **company profile** (`config/profiles/*.json`) describes the vendor whose CS team is using the tool: industry, product, customer objectives, lifecycle, adoption and engagement signals, KPIs, operating model roles, data sources, terminology, maturity stages, and optional indicator wording overrides.
2. The **AI layer** (`api/assess.js`) reads the profile, the account record, and a transcript, and returns structured evidence: a level (strong, partial, absent, unknown) for each indicator, marked as stated or inferred, with verbatim quotes. It also returns objectives, KPIs, use cases, risks, actions with owner roles, and missing information. It never assigns scores.
3. The **scoring engine** (`js/scoring.js`) calculates every score by rule from that evidence plus account data, using `config/scoring/health-v1.json` (four pillars) and `config/scoring/value-v1.json` (five value dimensions). Status, overall health, pattern (archetype), confidence, renewal risk, and the health vs value quadrant are all deterministic.

The same account is shown through two lenses: **Customer Health** and **Value Realization**.

## Project layout

```
index.html, css/app.css          shell and styles
js/app.js                        hash router
js/scoring.js                    deterministic scoring (pure, runs in browser and Node)
js/data.js, js/store.js          config loading, demo state in browser storage, live API call
js/views/*.js                    portfolio, account (5 tabs), new assessment, configuration
api/assess.js                    Vercel function: server-built prompt, forced tool output
config/profiles/                 default-b2b-saas, martech-adobe-example, legacy-cloverleaf (hidden)
config/scoring/                  health-v1, value-v1
data/demo/                       4 fictional accounts, 4 transcripts, 4 saved assessments
data/legacy/                     original prototype transcripts (legacy profile only)
tests/validate.mjs               validation suite (npm test)
tests/dev-server.mjs             local server; MOCK_MODEL=1 runs the live flow offline
```

## Deploy (Vercel)

1. Before pushing, tag the current production version: `git tag v1-cloverleaf && git push --tags`.
2. Replace the repo contents with this folder. `api/analyze.js` is removed on purpose (it was an open proxy).
3. Environment variables:
   - `ANTHROPIC_API_KEY` (required, already set)
   - `ANTHROPIC_MODEL` (optional; defaults to `claude-sonnet-4-5`)
   - `ALLOWED_ORIGIN` (optional; set to your site URL to restrict cross-origin calls)
4. No build step. Vercel serves the static files and `api/assess.js`.

## Run locally

```
node tests/dev-server.mjs                 # needs ANTHROPIC_API_KEY for live runs
MOCK_MODEL=1 node tests/dev-server.mjs    # offline: live flow returns canned results
npm test                                  # 47 checks
```

## Add a company profile (no code changes)

Copy `config/profiles/default-b2b-saas.json`, change the content, and either:
- add it to `config/profiles/index.json` and redeploy, or
- load it in the browser from **How scoring works > Load a profile** (saved in that browser only).

Use `indicatorOverrides` to reword an indicator for a company (for example, "Priority journeys live" instead of "Core use cases in workflow"). The indicator ids, weights, and rules stay the same, so scores remain comparable.

The original GovTech configuration is kept as a hidden profile: open the app with `?profile=legacy-cloverleaf`.

## Demo data

| Scenario | Account | Transcript | Health | Value | Pattern |
|---|---|---|---|---|---|
| A | Halden Freight Systems | Adoption and implementation review | 92 Healthy | 71 | The Expanding Account |
| B | Crestview Mutual Insurance | Executive business review | 69 At risk | 35 | The Unproven Investment |
| C | Sagebrook Health Partners | At-risk check-in | 52 At risk | 69 | The Headless Account |
| D | Marlow & Finch (Adobe Experience Cloud example) | Value realization review | 63 Watch | 34 | The Stalled Rollout |

Saved assessments load instantly. **Re-run live** sends the transcript to the model and recalculates; **Restore saved** returns to the saved version. **Reset demo data** clears everything stored in the browser.

## Three-minute demo script

1. **Portfolio (30s).** Read the headline. Point at the quadrant: health and value are scored separately. Crestview and Marlow & Finch look fine on relationship but have unproven value; Sagebrook has proven value but no sponsor.
2. **Crestview, Customer Health (40s).** Adoption 100, champion 84, yet At risk because ROI is red. Open "If nothing changes." Scroll to one indicator to show the quote and the Stated chip: the AI found the evidence, the rules set the score.
3. **Crestview, Value Realization (40s).** Zero of four KPIs have a baseline. Every "Missing" cell is a gap the tool refused to fill in.
4. **Marlow & Finch, Value Realization (40s).** The Adobe example. $2.1M shows as an estimate, not measured, because it is last-touch with no holdout. Two of four journeys live, win-back blocked on store data.
5. **Actions, then Executive Summary (30s).** Each action has an owner from the operating model and names the gap it closes. Print the one-page summary.
