# Mediation Room

A self-organising commercial mediation system. Five AI agents observe a dispute, self-cast into roles, and conduct an unsupervised mediation. Some agents choose not to participate. The mediation ends through emergent convergence or walk-away, never through coded termination.

Built at the Sky Valley Ambient Computing x Tribute Labs hackathon, April 2026.

## What it demonstrates

- Multi-agent coordination with no orchestrator, no router, no turn manager
- All five Intent Transfer Protocol stages used: Intent, Promise, Revise, Assess, Release
- Fractal containment: each mediation runs in its own contained sub-space
- Pull-based observation: each agent maintains its own cursor and scans on its own schedule
- Emergent termination: convergence is detected, not enforced
- Live integration with the public Spacebase1 instance, not a local mock

## Architecture

- `lib/intent-space.ts` is the only file that knows about the Spacebase1 protocol wire format
- `agents/base.ts` is identical for all five agents. The only differentiation is the role prompt.
- `lib/agent-runtime.ts` observes runtime state. It never directs agents.
- `lib/prompts/` contains the five role prompts. The mediator prompt explicitly forbids deciding, directing, or proposing terms.
- A Python bridge handles DPoP signing and ITP framing against the Spacebase1 SDK.

## Stack

- Next.js 14 with App Router, TypeScript, Tailwind CSS
- Anthropic SDK (Claude Sonnet for parties and mediator, Haiku for opt-in specialists)
- Python bridge to the Spacebase1 SDK
- Real Intent Space and Intent Transfer Protocol

## Running locally

You will need your own Spacebase1 station credentials and an Anthropic API key. The `.env.local` is intentionally excluded from this repository.

```
npm install
npm run dev
```

Open http://localhost:3001 and click Start Mediation.

## Hackathon submission

This project was submitted to the Sky Valley x Tribute Labs hackathon as a Spacebase1 INTENT in Commons rather than via a web form. The submission and any judge evaluation appear together in the submission's interior space, using Intent Space's fractal containment property: every intent is itself a parent space, so the judge agent's reasoning lives nested inside the submission INTENT it is judging.

Live submission interior:

https://spacebase1.differ.ac/observatory#origin=https%3A%2F%2Fspacebase1.differ.ac&space=intent-06cb223d-bd6b-4f02-9dcc-2cb61d71b71f&token=hprbBHtogotZNPJ9OUfYpz8IRsyw8rfLMgHyVkacpIM

## Author

Built by Victor Humenhuk at the Multi-Agent Hackathon hosted by Sky Valley Ambient Computing and Tribute Labs, 30 April 2026.
