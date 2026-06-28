const fs = require('fs');
const path = require('path');

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

  const passCount = results.filter((result) => result.candidate_pass).length;
  const baselinePassCount = results.filter((result) => result.baseline_pass).length;
  const regressions = results.filter((result) => result.regressed);

  return {
    name,
    total: results.length,
    baseline_pass_count: baselinePassCount,
    candidate_pass_count: passCount,
    score_pct: Math.round((passCount / results.length) * 100),
    baseline_score_pct: Math.round((baselinePassCount / results.length) * 100),
    regressions: regressions.length,
    regressed_trace_ids: regressions.map((result) => result.trace_id),
    results
  };
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
    dev,
    heldout
  };
}

if (require.main === module) {
  const candidateName = process.env.RESKILL_CANDIDATE || 'constrained';
  const candidateText = candidates[candidateName] || fs.readFileSync(candidateName, 'utf8');
  console.log(JSON.stringify(evaluateCandidate(candidateText), null, 2));
}

module.exports = {
  candidates,
  evaluateCandidate,
  evaluateSet,
  inspectPolicy,
  scoreTrace
};
