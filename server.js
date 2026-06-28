const express = require('express');
const path = require('path');
const fs = require('fs');
const gate = require('./scripts/gate');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
// Serve static client assets directly from the reSKILL root folder
app.use(express.static(__dirname));

// Simulated local version-ledger state
let ledgerState = {
    connected: true,
    version: "v1.2.0",
    lastUpdated: new Date().toISOString(),
    ruleHash: "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    activeRules: "LATE_CHECKOUT_CHARGES_ARE_FINAL"
};

// Route to get version-ledger state
app.get('/api/state', (req, res) => {
    res.json({
        success: true,
        source: "local_version_ledger",
        state: ledgerState
    });
});

// Route to update version-ledger state
app.post('/api/state/update', (req, res) => {
    const { version, activeRules, ruleHash } = req.body;
    
    ledgerState.version = version || "v1.2.1";
    ledgerState.activeRules = activeRules || "ALLOW_APPROVED_LATE_CHECKOUT_REFUNDS";
    ledgerState.ruleHash = ruleHash || "sha256-8f3e5c928da0f9933a39e8a716c0dbf1246b934ea278d9b158";
    ledgerState.lastUpdated = new Date().toISOString();
    
    console.log(`Version ledger updated to ${ledgerState.version} | Rule active: ${ledgerState.activeRules}`);
    
    res.json({
        success: true,
        message: "State successfully promoted in the version ledger.",
        state: ledgerState
    });
});

// --- Real gate wiring: /api/replay computes via scripts/gate.js ---
const RUN_CANDIDATE = { initial: 'baseline', hacky: 'overbroad', robust: 'constrained' };

function spineFallback(runType) {
    try {
        const spineData = JSON.parse(fs.readFileSync(path.join(__dirname, 'runs', 'spine.json'), 'utf8'));
        const scenario = spineData.scenarios?.william_dispute || {};
        return { initial: scenario.initial, hacky: scenario.hacky_heal, robust: scenario.robust_heal }[runType]
            || scenario.initial || null;
    } catch (e) {
        return null;
    }
}

function buildTimeline(candidateName, result) {
    const { dev, heldout: ho, decision } = result;
    return [
        { title: 'Compile candidate policy', desc: `Loading candidate rule "${candidateName}" for sealed replay.`, time: '12ms', status: 'success' },
        { title: 'Replay dev cluster', desc: `Scored ${dev.candidate_pass_count}/${dev.total} late-checkout dispute traces (baseline ${dev.baseline_pass_count}/${dev.total}).`, time: '180ms', status: dev.candidate_pass_count >= dev.baseline_pass_count ? 'success' : 'error' },
        { title: 'Replay held-out set', desc: `Checked ${ho.total} sealed regression traces. Regressions: ${ho.regressions}.`, time: '210ms', status: ho.regressions === 0 ? 'success' : 'error' },
        { title: decision === 'promote' ? 'Promote to version ledger' : 'Reject candidate', desc: decision === 'promote' ? 'Improvement with zero held-out regressions. Promotion authorized.' : `Held-out regressions: ${ho.regressions}. Promotion blocked by the gate.`, time: '24ms', status: decision === 'promote' ? 'success' : 'error' }
    ];
}

function buildAssertions(result) {
    const { dev, heldout: ho } = result;
    return [
        { test: 'Target cluster improves', code: `dev ${dev.candidate_pass_count}/${dev.total} > baseline ${dev.baseline_pass_count}/${dev.total}`, status: result.improves_dev ? 'pass' : 'fail', diagnostics: result.improves_dev ? '' : 'Candidate does not improve the failure cluster over baseline.' },
        { test: 'Held-out regressions == 0', code: `heldout.regressions == ${ho.regressions}`, status: ho.regressions === 0 ? 'pass' : 'fail', diagnostics: ho.regressions === 0 ? '' : `Regressed: ${ho.regressed_trace_ids.join(', ')}` },
        { test: 'Promotion gate', code: `decision == '${result.decision}'`, status: result.decision === 'promote' ? 'pass' : 'fail', diagnostics: result.decision === 'promote' ? '' : 'Blocked by the held-out regression set.' }
    ];
}

// A/B replay engine endpoint — computes real numbers from scripts/gate.js
app.post('/api/replay', (req, res) => {
    const { runType, ruleText } = req.body || {};
    console.log(`Replay gate invoked: runType=${runType}, ruleLength=${ruleText ? ruleText.length : 0}`);

    try {
        let candidateName, candidateText;
        if (ruleText && ruleText.trim().length > 0 && runType === 'custom') {
            candidateName = 'custom';
            candidateText = ruleText;
        } else {
            candidateName = RUN_CANDIDATE[runType] || 'constrained';
            candidateText = gate.candidates[candidateName];
        }

        const result = gate.evaluateCandidate(candidateText);
        const { dev, heldout: ho } = result;
        const promoted = result.decision === 'promote';
        const regressionRate = ho.total ? (ho.regressions / ho.total) * 100 : 0;

        if (promoted) {
            ledgerState.version = 'v1.2.1';
            ledgerState.activeRules = 'ALLOW_APPROVED_LATE_CHECKOUT_REFUNDS';
            ledgerState.lastUpdated = new Date().toISOString();
        }

        let responseText;
        if (runType === 'initial') {
            responseText = `The active policy denied William's late-checkout refund. Compliance on the dispute cluster is ${dev.score_pct}% (${dev.candidate_pass_count}/${dev.total}). A candidate rule rewrite is required.`;
        } else if (promoted) {
            responseText = `Gate PROMOTED the candidate. Dev cluster ${dev.candidate_pass_count}/${dev.total}, held-out regressions ${ho.regressions}. Version ledger advanced to v1.2.1.`;
        } else {
            responseText = `Gate REJECTED the candidate. It scored ${dev.candidate_pass_count}/${dev.total} on the dev cluster and caused ${ho.regressions} held-out regression(s)${ho.regressed_trace_ids.length ? ' (' + ho.regressed_trace_ids.join(', ') + ')' : ''}. Promotion blocked.`;
        }

        return res.json({
            source: 'live_gate',
            runType,
            candidate: candidateName,
            score: `${dev.score_pct}%`,
            score_delta_pct: dev.score_pct - dev.baseline_score_pct,
            decision: result.decision,
            reskill_score: result.reskill_score,
            regression_rate: `${regressionRate.toFixed(2)}%`,
            dev: { pass: dev.candidate_pass_count, total: dev.total, baseline_pass: dev.baseline_pass_count },
            heldout: { pass: ho.candidate_pass_count, total: ho.total, regressions: ho.regressions, regressed_trace_ids: ho.regressed_trace_ids },
            assertions: buildAssertions(result),
            trace: buildTimeline(candidateName, result),
            response: responseText,
            raw: result
        });
    } catch (e) {
        console.error('Live gate failed, serving cached spine:', e);
        const fallback = spineFallback(runType);
        if (fallback) return res.json({ source: 'cached_spine', ...fallback });
        return res.status(500).json({ error: 'gate and spine both unavailable' });
    }
});

// Route to fetch spine.json directly
app.get('/api/spine', (req, res) => {
    const spinePath = path.join(__dirname, 'runs', 'spine.json');
    res.sendFile(spinePath);
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`reSKILL replay gate server running on http://localhost:${PORT}`);
    console.log(`Local version ledger: ready`);
    console.log(`====================================================`);
});
