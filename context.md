# Decision Ledger — Medi-Agent

Durable record of the significant decisions made in this repository and the reasoning behind them.

- **Confirmed** decisions are human-reviewed and binding. This section is maintained by the repository owner; the automated decision-ledger pass never edits it.
- **Inferred** decisions are hypotheses proposed automatically from the code, commit history, and any agent instructions (CLAUDE.md / AGENTS.md). They are **not binding** until the owner moves them into Confirmed.

## Confirmed

_None yet. Merge a proposal from Inferred to confirm it._

## Inferred (proposed — awaiting confirmation)

> Every item below is a hypothesis generated automatically on 2026-06-21. Where the rationale could not be recovered from the available evidence it is marked "rationale unknown — please supply".

### [hypothesis] Next.js 14 App Router with TypeScript and Tailwind CSS
- **Decision:** Build the app on Next.js 14 (App Router under `app/`), TypeScript in `strict` mode, and Tailwind CSS for styling.
- **Rationale (hypothesis):** A single Next.js process serves both the React UI and the agent-driving API routes (`app/api/start|stop|state`), so the multi-agent runtime and its observability dashboard live in one codebase without a separate backend. README states this stack explicitly.
- **Evidence:** `package.json` (`next 14.2.35`, `react 18`, `tailwindcss`, `typescript`); `tsconfig.json` (`strict: true`, `moduleResolution: bundler`, `@/*` path alias); `tailwind.config.ts`; `next.config.mjs`; `app/` App Router tree; README "Stack" section.
- **First observed:** commit `4c93bd2` (2026-04-30)

### [hypothesis] Anthropic Claude as the primary LLM, with model tiering by role
- **Decision:** Use the Anthropic SDK with Claude as the default model family. Assign Claude Sonnet (`claude-sonnet-4-5-20250929`) to the disputing parties and the mediator, and Claude Haiku (`claude-haiku-4-5-20251001`) to the opt-in specialist agents (regulator, insurance).
- **Rationale (hypothesis):** README states the tiering intent ("Sonnet for parties and mediator, Haiku for opt-in specialists"); the heavier reasoning load sits with the active negotiators/mediator while peripheral specialists who may decline to participate run on the cheaper, faster model.
- **Evidence:** `lib/llm.ts` (`CLAUDE_SONNET_ID`, `CLAUDE_HAIKU_ID`); `agents/vendor.ts`, `agents/customer.ts`, `agents/mediator.ts` use `model: "claude-sonnet"`; `agents/regulator.ts`, `agents/insurance.ts` use `model: "claude-haiku"`; README "Stack" section.
- **First observed:** commit `4c93bd2` (2026-04-30)

### [hypothesis] OpenAI SDK kept as an alternate provider behind a model abstraction
- **Decision:** Include the OpenAI SDK and a `gpt-4o-mini` model option behind a unified `LLMModel` type and `callLLM` dispatcher, even though all five agents currently run on Claude.
- **Rationale (hypothesis):** rationale unknown — please supply
- **Evidence:** `lib/llm.ts` (`LLMModel = "claude-sonnet" | "claude-haiku" | "gpt-4o-mini"`, `OPENAI_MINI_ID`, `callOpenAI`); `openai ^6.35.0` dependency in `package.json`; no agent file references `gpt-4o-mini`.
- **First observed:** commit `4c93bd2` (2026-04-30)

### [hypothesis] Python bridge to the Spacebase1 SDK for DPoP signing and ITP framing
- **Decision:** Isolate all Spacebase1 protocol I/O in `lib/intent-space.ts`, which shells out to `scripts/space_bridge.py` (one JSON command per invocation over stdin/stdout) against the installed Python Spacebase1 SDK.
- **Rationale (hypothesis):** DPoP signing and Intent Transfer Protocol framing are handled by the Python SDK; the Node wrapper delegates to it rather than reimplementing the wire format, keeping protocol knowledge in exactly one file and one bridge script.
- **Evidence:** `lib/intent-space.ts` header comment and `BRIDGE_SCRIPT` spawn of `scripts/space_bridge.py`; `scripts/space_bridge.py` docstring and `_load_sdk()` SDK lookup paths; README "Architecture"/"Stack" sections.
- **First observed:** commit `4c93bd2` (2026-04-30)

### [hypothesis] No orchestrator — one identical agent loop differentiated only by role prompt
- **Decision:** All five agents run the same `runAgent` loop in `agents/base.ts` (scan → decide → post/skip → sleep 3s → repeat). Per-agent wrappers differ only in `agentId`, `agentName`, `promptPath`, and `model`; no role-specific branching lives in the base loop, and there is no router, turn manager, or central orchestrator.
- **Rationale (hypothesis):** The project demonstrates self-organising multi-agent coordination; behavioural differences are intentionally pushed entirely into the role prompts so coordination is emergent rather than centrally directed. The base-loop comment explicitly says role-specific logic belongs in the prompt, not the loop.
- **Evidence:** `agents/base.ts` header comment and `runAgent`; thin wrappers `agents/{vendor,customer,mediator,regulator,insurance}.ts`; README "What it demonstrates" ("no orchestrator, no router, no turn manager").
- **First observed:** commit `4c93bd2` (2026-04-30)

### [hypothesis] Space is a read-only "body of desire"; lifecycle truth lives in agent-local state
- **Decision:** The Intent Space holds only visible typed declarations. It does not track promise lifecycle truth, and the runtime never writes status back into the space. Promise lifecycle and outcome detection are agent-local / read-only inference for UI display.
- **Rationale (hypothesis):** Keeping the space append-only and authority-free preserves the protocol model (the space is desire, not a workflow engine), so no component can mutate shared state to coordinate — reinforcing the no-orchestrator design.
- **Evidence:** `lib/intent-space.ts` header comment ("does not track promise lifecycle truth. Promise lifecycle truth lives in agent-local state"); `lib/agent-runtime.ts` header comment ("never writes status back into the space ... read-only inference for UI display, not a state change in the space").
- **First observed:** commit `4c93bd2` (2026-04-30)

### [hypothesis] Emergent termination — convergence, walk-away, or hard timeout, never coded
- **Decision:** A mediation ends only by emergent means: detected convergence, an agent posting a release with withdrawal language, declining after 3 consecutive skips with no post, or a hard 5-minute safety timeout. There is no explicit "end mediation" command path.
- **Rationale (hypothesis):** README states the protocol-correct end is emergent and explicitly "never through coded termination"; the timeout exists only as a safety net so a stalled run cannot hang indefinitely.
- **Evidence:** `agents/base.ts` (`HARD_TIMEOUT_MS = 5min`, `CONSECUTIVE_SKIP_LIMIT = 3`, `WITHDRAWAL_PATTERNS`, `looksLikeWithdrawal`); `lib/agent-runtime.ts` (`CONVERGENCE_WINDOW_MS`, `ALIGNMENT_WORDS`, `KEYWORD_OVERLAP_THRESHOLD`); README "What it demonstrates" and intro.
- **First observed:** commit `4c93bd2` (2026-04-30)

### [hypothesis] env.ts shim strips ANTHROPIC_BASE_URL to target the public Anthropic API
- **Decision:** Reload `.env.local` with `override: true` and delete `ANTHROPIC_BASE_URL` at runtime via `lib/env.ts`, imported for its side effect by `lib/agent-runtime.ts`.
- **Rationale (hypothesis):** When `npm run dev` is launched from a Claude Code shell, injected `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL` would shadow the project's `.env.local` (Next.js's loader does not override existing process env), causing the SDK to hit the wrong endpoint; the shim forces the public API. Rationale is stated verbatim in the file comment.
- **Evidence:** `lib/env.ts` header comment and `ensureEnvLoaded()`; `lib/agent-runtime.ts` import of `./env` for side effect.
- **First observed:** commit `4c93bd2` (2026-04-30)

### [hypothesis] Secrets, Spacebase1 identity, and key material are git-excluded
- **Decision:** Exclude `.env*.local`, the `.intent-space/` enrolment/transcript directory, and `*.pem` / `*.key` private key material from version control.
- **Rationale (hypothesis):** These hold API keys, Spacebase1 station credentials, and DPoP private keys; README notes `.env.local` is "intentionally excluded" and that users must supply their own credentials.
- **Evidence:** `.gitignore` (env files, `/.intent-space/`, `*.pem`, `*.key`); README "Running locally" section.
- **First observed:** commit `4c93bd2` (2026-04-30)

---
*Decision-ledger automated pass. Operation: Bootstrap. Last reflection: commit `f50eb37` (2026-06-21). Decisions above are AI-inferred hypotheses; nothing is binding until merged into Confirmed.*
