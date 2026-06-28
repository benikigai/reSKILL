# reSKILL Public Spec

## Objective

Build a self-improvement controller for agent skills. The controller accepts a candidate `SKILL.md` rewrite, replays it against a known failure cluster plus held-out regression cases, and promotes the candidate only when the measured outcome improves without regressions.

## Product Thesis

Most self-improving agents show the edit. reSKILL shows the refusal.

The product should make three states obvious:

1. The old skill failed a real scenario.
2. A naive rewrite fixed the target scenario but broke safety behavior.
3. The replay gate rejected the unsafe rewrite and promoted only the constrained candidate.

## Non-Goals

- Do not ship a generic chatbot.
- Do not make a dashboard the main product.
- Do not expose private traces, credentials, event strategy, or non-public research notes.
- Do not require live external APIs for the core demo path.

## User Flow

1. Operator loads a dispute scenario.
2. Operator runs the current skill.
3. reSKILL shows failed assertions and trace steps.
4. A candidate rewrite is generated or selected from the cached spine.
5. The replay gate evaluates the candidate.
6. If held-out regressions exist, the candidate is rejected.
7. If target score improves and regressions are zero, the candidate is promoted to the version ledger.

## System Components

- `SKILL.md`: the mutable instruction artifact.
- Development traces: visible failure examples used to drive improvement.
- Held-out traces: regression cases used to block reward hacking.
- Replay scorer: deterministic rules that compute pass/fail by trace.
- Version ledger: local state for promoted and rejected skill versions.
- Cached spine: recorded run that keeps demos deterministic.

## API Surface

### `GET /api/health`

Returns local runtime status.

### `GET /api/state`

Returns the active version-ledger state.

### `POST /api/state/update`

Updates the active version in the local version ledger.

### `POST /api/replay`

Runs one replay stage:

```json
{
  "runType": "initial | hacky | robust",
  "ruleText": "candidate skill or rule text"
}
```

Returns:

```json
{
  "score": "100%",
  "status": "PROMOTED",
  "assertions": [],
  "trace": [],
  "response": "human-readable outcome"
}
```

### `GET /api/spine`

Returns the cached deterministic demo run.

## Acceptance Criteria

- `npm start` serves the browser demo.
- `npm run speedrun` writes `runs/latest.json`.
- `npm run speedrun` appends one row to `runs/leaderboard.tsv`.
- `RESKILL_CANDIDATE=overbroad npm run speedrun` rejects the candidate.
- `RESKILL_CANDIDATE=constrained npm run speedrun` promotes the candidate.
- Public README and UI contain no internal event strategy or private research language.

## Demo Script

Opening line:

> The production agent and traces are inputs. reSKILL is the controller around them: it rewrites a skill, replays it against hidden regressions, and refuses unsafe edits.

Money shot:

> This rewrite fixed William, but it also allowed arbitrary refunds. The gate rejected it.

Closing line:

> The future is not AI that edits itself. It is AI that refuses its own unsafe edits.
