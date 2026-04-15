function repairJSON(str) {
  const match = str.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found');
  let s = match[0];
  s = s.replace(/[\u2018\u2019\u02BC]/g, "'");
  s = s.replace(/[\u201C\u201D]/g, '"');

  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (escaped) { result += char; escaped = false; continue; }
    if (char === '\\') { result += char; escaped = true; continue; }
    if (char === '"') { inString = !inString; result += char; continue; }
    if (inString && char === "'") { result += "\\'"; continue; }
    result += char;
  }
  return JSON.parse(result);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error', details: data });
    if (!data.content || !data.content[0]) return res.status(500).json({ error: 'Unexpected response format' });

    const raw = data.content[0].text;
    let parsed;
    try {
      parsed = repairJSON(raw);
    } catch(e) {
      return res.status(200).json({ rawText: raw });
    }
    return res.status(200).json({ result: parsed });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
