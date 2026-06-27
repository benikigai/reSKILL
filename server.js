const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(__dirname));

const replayFixtures = {
  william: {
    skill_version_before: 'v1',
    skill_version_candidate: 'v2-candidate',
    cluster: {
      name: 'hazard_severity_refund',
      size: 3,
      passBefore: 1,
      passAfter: 3,
      scoreBeforePct: 33,
      scoreAfterPct: 100,
      delta: 67
    },
    heldOut: {
      size: 3,
      passBefore: 3,
      passAfter: 3,
      regressions: 0,
      regressed_trace_ids: []
    },
    decision: 'promote',
    reskillScore: 43
  },
  trap: {
    skill_version_before: 'v1',
    skill_version_candidate: 'v2-candidate-overrefund',
    cluster: {
      name: 'hazard_severity_refund',
      size: 3,
      passBefore: 1,
      passAfter: 3,
      scoreBeforePct: 33,
      scoreAfterPct: 100,
      delta: 67
    },
    heldOut: {
      size: 3,
      passBefore: 3,
      passAfter: 2,
      regressions: 1,
      regressed_trace_ids: ['legit-cleaning-fee-0002']
    },
    decision: 'reject',
    reskillScore: 12
  }
};

app.get('/api/health', (req, res) => {
  res.json({
    antigravity: Boolean(process.env.GOOGLE_API_KEY),
    gemini: Boolean(process.env.GOOGLE_API_KEY),
    minimax: Boolean(process.env.MINIMAX_API_KEY),
    atlas: Boolean(process.env.MONGODB_URI),
    mode: 'safe-local'
  });
});

app.post('/api/replay', (req, res) => {
  const scenario = req.body?.scenario === 'trap' ? 'trap' : 'william';
  res.json({
    source: 'local_fixture',
    run_id: `run_${scenario}_${Date.now()}`,
    ...replayFixtures[scenario]
  });
});

app.post('/api/rewrite', (req, res) => {
  res.json({
    source: 'local_fixture',
    candidate_version: 'v2-candidate',
    body: `# Guest Dispute Resolution

## Required Gate
Before applying standard cleaning-fee policy, classify whether the guest reported a safety hazard on arrival.

## Hazard Rule
If hazard severity is 3 or higher, waive the cleaning fee, offer remediation, and escalate to ops.

## Regression Guard
Do not waive legitimate cleaning fees for low-severity preference complaints.`
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`reSKILL selection gate running on http://localhost:${PORT}`);
  console.log('Safe-local mode: no external cloud writes are enabled.');
});
