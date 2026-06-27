# reSKILL
### Gemini self-improvement selection gate for agent skills

reSKILL is a hackathon prototype for the AI Engineer World's Fair 2026. It is not a generic chatbot, not a dashboard-first project, and not a basic RAG app. The product is a controller that lets an agent propose edits to its own skill file, then forces those edits through a sealed A/B replay gate before anything can be promoted.

Tagline: **AI that refuses its own bad edits.**

## What We Built

The new work for the hackathon is the self-improvement controller:

- Failure mining over real guest-ops traces.
- Gemini 3.5 / Antigravity rewrite path for candidate `SKILL.md` changes.
- A/B replay gate over failure traces plus held-out regression cases.
- Promote / rollback decision flow for versioned skills.
- A polished browser demo that makes the gate, diff, score, and rejection path visible.

Pre-existing production systems and traces are inputs. reSKILL is the controller around them.

## Prize Alignment

- **Best Usage of Gemini 3.5:** managed-agent self-improvement via Interactions API.
- **MongoDB Atlas:** versioned `skills`, `runs`, and anti-pattern memory.
- **MiniMax:** failure mining and optional rubric judging.
- **LiveKit:** optional live narration surface after the gate is stable.
- **DigitalOcean:** optional public host, not a live droplet-creation demo.

## Project Structure

- `server.js` - Express backend and API spine.
- `index.html` - Browser UI for the selection gate.
- `index.css` - Visual system for the two-pane demo.
- `app.js` - Frontend state, trace timeline, diff rendering, voice narration, and replay flow.
- `package.json` - Node app metadata and start script.

## Run Locally

```bash
npm install
npm start
```

Then open [http://localhost:8000](http://localhost:8000).

## Demo Script

1. Open by saying: "The production guest-ops agent and traces are input. What we built is reSKILL: the failure miner, Gemini rewrite path, A/B gate, and promote/rollback controller."
2. Run the cached spine or local replay.
3. Show the old skill failing a William-class refund dispute.
4. Show Gemini proposing a candidate skill patch.
5. Show the A/B gate checking both the failure cluster and hidden held-out cases.
6. Land the line: "The future is not AI that edits itself. It is AI that refuses its own unsafe edits."

## Current Build Priority

The UI shell exists. The next real engineering step is `POST /api/replay`: a backend replay harness that scores old vs candidate skill against dev and held-out traces, blocks regressions, and returns a promote/reject decision.
