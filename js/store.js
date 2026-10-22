// Browser-local demo state. Everything here is optional: the app renders the
// seed demo data if storage is empty, blocked, or throws.
const KEY = 'cleverhealth.v2';
const empty = () => ({ version: 2, assessments: {}, customAccounts: [], customProfiles: [] });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw);
    return { ...empty(), ...s };
  } catch { return empty(); }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  return empty();
}
