const fs = require('fs');
const path = require('path');
const { candidates, evaluateCandidate } = require('./gate');

const repoRoot = path.join(__dirname, '..');
const runsDir = path.join(repoRoot, 'runs');
const latestPath = path.join(runsDir, 'latest.json');
const leaderboardPath = path.join(runsDir, 'leaderboard.tsv');

function ensureRunsDir() {
  fs.mkdirSync(runsDir, { recursive: true });
}

function getCandidate() {
  const candidateName = process.env.RESKILL_CANDIDATE || 'constrained';
  if (candidates[candidateName]) {
    return {
      name: candidateName,
      text: candidates[candidateName]
    };
  }

  return {
    name: path.basename(candidateName),
    text: fs.readFileSync(path.resolve(candidateName), 'utf8')
  };
}

function appendLeaderboard(run) {
  const header = [
    'run_id',
    'timestamp',
    'candidate',
    'dev_pass',
    'dev_total',
    'heldout_pass',
    'heldout_total',
    'regressions',
    'reskill_score',
    'decision'
  ].join('\t');

  if (!fs.existsSync(leaderboardPath)) {
    fs.writeFileSync(leaderboardPath, `${header}\n`);
  }

  const row = [
    run.run_id,
    run.timestamp,
    run.candidate,
    run.result.dev.candidate_pass_count,
    run.result.dev.total,
    run.result.heldout.candidate_pass_count,
    run.result.heldout.total,
    run.result.heldout.regressions,
    run.result.reskill_score,
    run.result.decision
  ].join('\t');

  fs.appendFileSync(leaderboardPath, `${row}\n`);
}

function main() {
  ensureRunsDir();
  const candidate = getCandidate();
  const timestamp = new Date().toISOString();
  const run = {
    run_id: `run_${timestamp.replace(/[-:.TZ]/g, '').slice(0, 14)}_${candidate.name}`,
    timestamp,
    candidate: candidate.name,
    result: evaluateCandidate(candidate.text)
  };

  fs.writeFileSync(latestPath, `${JSON.stringify(run, null, 2)}\n`);
  appendLeaderboard(run);

  console.log(`reSKILL speedrun: ${run.result.decision.toUpperCase()}`);
  console.log(`candidate=${run.candidate}`);
  console.log(`dev=${run.result.dev.candidate_pass_count}/${run.result.dev.total}`);
  console.log(`heldout=${run.result.heldout.candidate_pass_count}/${run.result.heldout.total}`);
  console.log(`regressions=${run.result.heldout.regressions}`);
  console.log(`score=${run.result.reskill_score}`);

  if (run.result.decision !== 'promote') {
    process.exitCode = 1;
  }
}

main();
