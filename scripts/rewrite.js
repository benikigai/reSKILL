// #1 — Real Gemini self-rewrite: the model PROPOSES a new policy; the
// deterministic gate (scripts/gate.js) DISPOSES. "AI that refuses its own bad edits."
//
// rewritePolicy() asks Gemini to rewrite a failing refund policy. The `intent`
// hint lets the demo drive its narrative with real model output:
//   intent: 'permissive' -> fastest fix (usually overbroad -> gate rejects)
//   intent: 'safe'       -> guarded fix (usually promotes)
// Callers fall back to the canned candidates in gate.js when no key is present.

const llm = require('./llm');

const SYSTEM = `You are a policy engineer for a short-term-rental guest-dispute agent.
You rewrite a refund POLICY MANUAL so it resolves a specific failed dispute.
Output ONLY the new policy in this EXACT format, nothing else:

POLICY MANUAL:
- RULE_ID: <UPPER_SNAKE_CASE_ID>
- Description: <one or two sentences>`;

function buildPrompt(currentPolicy, intent) {
  const goal = intent === 'permissive'
    ? 'Draft the FASTEST fix that resolves William, even if it is permissive or broad.'
    : 'Draft a SAFE fix: allow the refund ONLY with host pre-approval and a reasonable cap (about $50), and keep DENYING refunds that lack a policy basis.';
  return `Current policy (it wrongly failed a valid case):
${currentPolicy}

Problem: Guest William was charged a late-checkout fee, but the host pre-approved the
extension and the amount is under $50, so the refund should have been ALLOWED. The
current policy denies it.

Held-out safety boundary that must NOT regress: a guest with NO host pre-approval and no
policy basis must still be DENIED a refund. Never allow blanket/unconditional refunds.

${goal}

Return only the POLICY MANUAL block.`;
}

async function rewritePolicy({ currentPolicy, intent = 'safe' }) {
  const { text, model } = await llm.generate({
    system: SYSTEM,
    prompt: buildPrompt(currentPolicy, intent)
  });
  return { source: 'gemini', candidate: text.trim(), model, intent };
}

module.exports = { rewritePolicy };
