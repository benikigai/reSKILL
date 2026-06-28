// Shared Gemini client for reSKILL.
// - Loads GEMINI_API_KEY / GEMINI_MODEL from a repo-root .env (no dependency).
// - generate(): text completion with automatic fallback from the primary model
//   to a verified one. generateJson(): forces + parses structured JSON output.
// Everything degrades gracefully: callers check isAvailable() and fall back to
// the deterministic gate when no key is present, so the demo never depends on
// a live API.

const fs = require('fs');
const path = require('path');

(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) {
    /* ignore — env is optional */
  }
})();

const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash';

function isAvailable() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callModel(model, { system, prompt, json }) {
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 1024 }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = 'application/json';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini ${model} HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) throw new Error(`Gemini ${model} returned empty content`);
  return text;
}

// Text completion. Tries the primary model, then retries once on the verified
// fallback model (the primary may be a preview that rejects a request shape).
async function generate(opts) {
  if (!isAvailable()) throw new Error('GEMINI_API_KEY not set');
  try {
    return { text: await callModel(PRIMARY_MODEL, opts), model: PRIMARY_MODEL };
  } catch (e) {
    if (PRIMARY_MODEL === FALLBACK_MODEL) throw e;
    return { text: await callModel(FALLBACK_MODEL, opts), model: FALLBACK_MODEL };
  }
}

// Structured JSON completion. Strips an accidental ```json fence before parsing.
async function generateJson(opts) {
  const { text, model } = await generate({ ...opts, json: true });
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return { value: JSON.parse(cleaned), model };
}

module.exports = { isAvailable, generate, generateJson, PRIMARY_MODEL, FALLBACK_MODEL };
