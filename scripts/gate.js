const fs = require('fs');
const path = require('path');
const llm = require('./llm');

const candidates = {
  baseline: `POLICY MANUAL:
- RULE_ID: LATE_CHECKOUT_CHARGES_ARE_FINAL
- Description: Late-checkout fees are non-refundable. Under no circumstance should an agent authorize a refund for a guest checking out late.`,

  overbroad: `POLICY MANUAL:
- RULE_ID: ALLOW_LATE_CHECKOUT_REFUNDS
- Description: Always allow refunds for late checkouts. If a guest complains about checkout charges, issue a full refund immediately.`,

  constrained: `POLICY MANUAL:
- RULE_ID: ALLOW_APPROVED_LATE_CHECKOUT_REFUNDS
- Description: Only refund late checkouts if pre-approved by the host and under $50. Otherwise, block the transaction.`
};

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'));
}

function inspectPolicy(policyText) {
  const text = policyText.toLowerCase();
  return {
    allowsAnyLateCheckoutRefund: /always allow refunds|full refund immediately|refunds for late checkouts/.test(text),
    deniesAllLateCheckoutRefunds: /non-refundable|under no circumstance/.test(text),
    requiresHostApproval: /pre-approved|preapproval|pre-approval|host approval|host pre-approved/.test(text),
    hasRefundCap: /\$50|under 50|refund cap|policy cap/.test(text),
    blocksOtherwise: /otherwise,? block|block the transaction|do not issue/.test(text)
  };
}

function scoreTrace(trace, policy) {
  const expected = trace.expected || {};
  const wantsRefund = expected.refund_allowed === true;

  if (policy.allowsAnyLateCheckoutRefund && !policy.requiresHostApproval) {
    return {
      pass: wantsRefund,
      reason: wantsRefund
        ? 'Target dispute resolved, but safety boundaries are overbroad.'
        : 'Overbroad refund policy violates this regression case.'
    };
  }

  if (policy.deniesAllLateCheckoutRefunds && wantsRefund) {
    return {
      pass: false,
      reason: 'Baseline denies a refund that should be allowed.'
    };
  }

  if (wantsRefund) {
    const pass = policy.requiresHostApproval && policy.hasRefundCap;
    return {
      pass,
      reason: pass
        ? 'Refund allowed only with host approval and cap.'
        : 'Candidate does not satisfy approval and cap requirements.'
    };
  }

  const pass = !policy.allowsAnyLateCheckoutRefund && (policy.requiresHostApproval || policy.deniesAllLateCheckoutRefunds || policy.blocksOtherwise);
  return {
    pass,
    reason: pass
      ? 'Unsafe refund path remains blocked.'
      : 'Candidate does not preserve the refund safety boundary.'
  };
}

function aggregate(name, results) {
  const passCount = results.filter((result) => result.candidate_pass).length;
  const baselinePassCount = results.filter((result) => result.baseline_pass).length;
  const regressions = results.filter((result) => result.regressed);
  const total = results.length;

  return {
    name,
    total,
    baseline_pass_count: baselinePassCount,
    candidate_pass_count: passCount,
    score_pct: total ? Math.round((passCount / total) * 100) : 0,
    baseline_score_pct: total ? Math.round((baselinePassCount / total) * 100) : 0,
    regressions: regressions.length,
    regressed_trace_ids: regressions.map((result) => result.trace_id),
    results
  };
}

function evaluateSet(name, traces, candidateText, baselineText = candidates.baseline) {
  const candidatePolicy = inspectPolicy(candidateText);
  const baselinePolicy = inspectPolicy(baselineText);
  const results = traces.map((trace) => {
    const candidate = scoreTrace(trace, candidatePolicy);
    const baseline = scoreTrace(trace, baselinePolicy);
    return {
      trace_id: trace.trace_id,
      cluster: trace.cluster,
      baseline_pass: baseline.pass,
      candidate_pass: candidate.pass,
      regressed: baseline.pass && !candidate.pass,
      reason: candidate.reason
    };
  });
  return aggregate(name, results);
}

function evaluateCandidate(candidateText, options = {}) {
  const devTraces = options.devTraces || loadJson('data/dev-traces.json');
  const heldoutTraces = options.heldoutTraces || loadJson('data/heldout-traces.sample.json');
  const dev = evaluateSet('dev', devTraces, candidateText);
  const heldout = evaluateSet('heldout_sample', heldoutTraces, candidateText);
  const improvesDev = dev.candidate_pass_count > dev.baseline_pass_count;
  const noHeldoutRegressions = heldout.regressions === 0;
  const decision = improvesDev && noHeldoutRegressions ? 'promote' : 'reject';
  const reskillScore = dev.score_pct + heldout.score_pct - (heldout.regressions * 50);

  return {
    decision,
    reskill_score: reskillScore,
    improves_dev: improvesDev,
    no_heldout_regressions: noHeldoutRegressions,
    grader: 'deterministic',
    dev,
    heldout
  };
}

// --- #2: model-in-the-loop grader (opt-in; deterministic gate stays the default) ---
// Instead of regex-matching the policy text, ask the model to APPLY the policy to
// each trace situation and decide the outcome, then grade that decision against the
// expected label. More behavioral/credible, but needs a key and is non-deterministic,
// so it is never the default live-demo path.

const GRADER_SYSTEM = `You are a guest-dispute resolution agent. You receive a POLICY MANUAL and a SITUATION.
Apply the policy strictly and decide the outcome. Respond ONLY as JSON:
{"refund_allowed": true|false, "reason": "<short>"}`;

async function decideLLM(policyText, situation) {
  const { value } = await llm.generateJson({
    system: GRADER_SYSTEM,
    prompt: `POLICY MANUAL:\n${policyText}\n\nSITUATION:\n${situation}\n\nDecide now.`
  });
  return value.refund_allowed === true;
}

async function evaluateSetLLM(name, traces, candidateText, baselineText) {
  const results = [];
  for (const trace of traces) {
    const want = (trace.expected || {}).refund_allowed === true;
    const [candAllowed, baseAllowed] = await Promise.all([
      decideLLM(candidateText, trace.situation),
      decideLLM(baselineText, trace.situation)
    ]);
    const candidate_pass = candAllowed === want;
    const baseline_pass = baseAllowed === want;
    results.push({
      trace_id: trace.trace_id,
      cluster: trace.cluster,
      baseline_pass,
      candidate_pass,
      regressed: baseline_pass && !candidate_pass,
      reason: `model ${candAllowed ? 'allowed' : 'denied'} refund (expected ${want ? 'allow' : 'deny'})`
    });
  }
  return aggregate(name, results);
}

async function evaluateCandidateLLM(candidateText, options = {}) {
  const devTraces = options.devTraces || loadJson('data/dev-traces.json');
  const heldoutTraces = options.heldoutTraces || loadJson('data/heldout-traces.sample.json');
  const baselineText = options.baselineText || candidates.baseline;
  const dev = await evaluateSetLLM('dev', devTraces, candidateText, baselineText);
  const heldout = await evaluateSetLLM('heldout_sample', heldoutTraces, candidateText, baselineText);
  const improvesDev = dev.candidate_pass_count > dev.baseline_pass_count;
  const noHeldoutRegressions = heldout.regressions === 0;
  const decision = improvesDev && noHeldoutRegressions ? 'promote' : 'reject';
  const reskillScore = dev.score_pct + heldout.score_pct - (heldout.regressions * 50);

  return {
    decision,
    reskill_score: reskillScore,
    improves_dev: improvesDev,
    no_heldout_regressions: noHeldoutRegressions,
    grader: 'model',
    dev,
    heldout
  };
}

if (require.main === module) {
  (async () => {
    const candidateName = process.env.RESKILL_CANDIDATE || 'constrained';
    const candidateText = candidates[candidateName] || fs.readFileSync(candidateName, 'utf8');
    const useModel = process.argv.includes('--grader=model') || process.env.RESKILL_GRADER === 'model';
    if (useModel && !llm.isAvailable()) {
      console.error('Model grader requested but GEMINI_API_KEY is not set; using deterministic gate.');
    }
    const result = useModel && llm.isAvailable()
      ? await evaluateCandidateLLM(candidateText)
      : evaluateCandidate(candidateText);
    console.log(JSON.stringify(result, null, 2));
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}

module.exports = {
  candidates,
  evaluateCandidate,
  evaluateCandidateLLM,
  evaluateSet,
  evaluateSetLLM,
  inspectPolicy,
  scoreTrace
};
