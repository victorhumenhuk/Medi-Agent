/*
 * Agent runtime.
 * This module observes the space and the agents to compute display state.
 * It never writes status back into the space. The space remains the body of desire only.
 * Outcome detection (agreement, walkaway, timeout) is read-only inference for UI display, not a state change in the space.
 */

import { ensureEnvLoaded } from "./env";
ensureEnvLoaded();

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { enter, postScenario } from "./intent-space";
import { startVendor } from "@/agents/vendor";
import { startCustomer } from "@/agents/customer";
import { startMediator } from "@/agents/mediator";
import { startInsurance } from "@/agents/insurance";
import { startRegulator } from "@/agents/regulator";
import type { Agent, AgentState, Post, RuntimeState } from "@/types";

const HARD_TIMEOUT_MS = 5 * 60 * 1000;
const CONVERGENCE_WINDOW_MS = 90 * 1000;
const WATCHER_INTERVAL_MS = 5000;
const KEYWORD_OVERLAP_THRESHOLD = 3;

const ALIGNMENT_WORDS = new Set([
  "accepted", "accepts", "accept",
  "alignment", "aligned", "align",
  "agreement", "agreed", "agree",
  "terms", "convergence", "settlement", "settled",
]);

const ANCHOR_TOKENS = new Set([
  "credits", "failover", "remediation", "compensation", "indemnity",
  "redress", "refund", "service", "days", "weeks", "months", "plan",
]);

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "this", "that", "these",
  "those", "i", "we", "you", "they", "it", "as", "at", "by", "from", "our",
  "your", "their", "its", "if", "so", "do", "does", "did", "have", "has", "had",
  "will", "shall", "can", "could", "should", "would", "may", "might", "must",
  "not", "no", "yes", "any", "some", "all", "each", "every", "such", "than",
  "then", "also", "into", "out", "up", "down", "about", "against", "between",
  "through", "after", "before", "while", "during", "without", "within", "here",
  "there", "what", "which", "who", "whom", "whose", "where", "when", "why",
  "how", "shall", "ought", "very", "just", "only", "own", "same", "other",
  "more", "most", "less", "least", "much", "many", "few", "fewer",
]);

function makeInitialAgent(id: string, name: string, role: string): Agent {
  return {
    id,
    name,
    role,
    state: "idle",
    postCount: 0,
    hasEnteredRoom: false,
    lastSeqSeen: 0,
  };
}

function freshRuntime(): RuntimeState {
  return {
    spaceId: undefined,
    rootIntentId: undefined,
    startedAt: undefined,
    status: "idle",
    posts: [],
    agents: {
      vendor: makeInitialAgent(
        "vendor",
        "Vendor Counsel",
        "Counsel for CloudCRM Ltd"
      ),
      customer: makeInitialAgent(
        "customer",
        "Customer Counsel",
        "Counsel for RetailCo plc"
      ),
      mediator: makeInitialAgent(
        "mediator",
        "Mediator",
        "Neutral commercial mediator"
      ),
      insurance: makeInitialAgent(
        "insurance",
        "Insurance Specialist",
        "Domain specialist, opt-in"
      ),
      regulator: makeInitialAgent(
        "regulator",
        "Regulator",
        "Domain specialist, opt-in"
      ),
    },
  };
}

let runtime: RuntimeState = freshRuntime();
let abortController: AbortController | null = null;
let watcherHandle: ReturnType<typeof setInterval> | null = null;

export function getRuntime(): RuntimeState {
  return {
    ...runtime,
    agents: { ...runtime.agents },
    posts: [...runtime.posts].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    ),
  };
}

function makeStateCallback(agentId: string) {
  return (state: AgentState) => {
    const agent = runtime.agents[agentId];
    if (!agent) return;
    agent.state = state;
    agent.lastActionAt = new Date().toISOString();
    agent.hasEnteredRoom = true;
  };
}

function makePostCallback(agentId: string) {
  return (post: Post) => {
    runtime.posts.push(post);
    const agent = runtime.agents[agentId];
    if (agent) agent.postCount += 1;
  };
}

function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/(\d),(\d)/g, "$1$2")
      .replace(/(\d),(\d)/g, "$1$2")
      .replace(/[^a-z0-9£%\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .filter((word) => word.length >= 4 || /\d/.test(word))
      .filter((word) => !STOPWORDS.has(word))
  );
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const word of a) if (b.has(word)) out.add(word);
  return out;
}

function hasConcreteAnchor(tokens: Set<string>): boolean {
  for (const token of tokens) {
    if (/\d/.test(token)) return true;
    if (token.includes("£")) return true;
    if (ANCHOR_TOKENS.has(token)) return true;
  }
  return false;
}

function hasAlignmentLanguage(tokens: Set<string>): boolean {
  for (const token of tokens) {
    if (ALIGNMENT_WORDS.has(token)) return true;
  }
  return false;
}

/*
 * Convergence patterns (any one within the last 90 seconds qualifies):
 *   1. Vendor and Customer both posted "promise" with >= 3 substantive shared tokens.
 *   2. One party posted "promise" and the other party posted "assess" with >= 3
 *      shared substantive tokens, at least one of which is a concrete anchor
 *      (number, currency, or domain term like "credits"/"failover"/"days").
 *   3. Either party posted "promise" and the Mediator posted "assess" containing
 *      alignment language ("accepted", "alignment", "agreement", "terms"...).
 *
 * Detection is read-only inference. It never writes anything back into the space.
 */
function detectAgreement(): boolean {
  const cutoff = Date.now() - CONVERGENCE_WINDOW_MS;
  const recent = runtime.posts.filter((p) => Date.parse(p.timestamp) >= cutoff);

  const vendorPromise = recent.find(
    (p) => p.authorId === "vendor" && p.stage === "promise"
  );
  const customerPromise = recent.find(
    (p) => p.authorId === "customer" && p.stage === "promise"
  );
  const vendorAssess = recent.find(
    (p) => p.authorId === "vendor" && p.stage === "assess"
  );
  const customerAssess = recent.find(
    (p) => p.authorId === "customer" && p.stage === "assess"
  );
  const mediatorAssess = recent.find(
    (p) => p.authorId === "mediator" && p.stage === "assess"
  );

  if (vendorPromise && customerPromise) {
    const overlap = intersect(
      tokenise(vendorPromise.content),
      tokenise(customerPromise.content)
    );
    if (overlap.size >= KEYWORD_OVERLAP_THRESHOLD) {
      console.log(
        `[runtime] convergence pattern 1 (both promise): overlap={${[...overlap].join(", ")}}`
      );
      return true;
    }
  }

  const promiseAssessPairs: Array<[Post, Post, string]> = [];
  if (vendorPromise && customerAssess)
    promiseAssessPairs.push([vendorPromise, customerAssess, "vendor-promise + customer-assess"]);
  if (customerPromise && vendorAssess)
    promiseAssessPairs.push([customerPromise, vendorAssess, "customer-promise + vendor-assess"]);
  for (const [promise, assess, label] of promiseAssessPairs) {
    const overlap = intersect(tokenise(promise.content), tokenise(assess.content));
    if (overlap.size >= KEYWORD_OVERLAP_THRESHOLD && hasConcreteAnchor(overlap)) {
      console.log(
        `[runtime] convergence pattern 2 (${label}): overlap={${[...overlap].join(", ")}}`
      );
      return true;
    }
  }

  if (mediatorAssess && (vendorPromise || customerPromise)) {
    const mediatorTokens = tokenise(mediatorAssess.content);
    if (hasAlignmentLanguage(mediatorTokens)) {
      console.log(
        "[runtime] convergence pattern 3 (party promise + mediator alignment assess)"
      );
      return true;
    }
  }

  return false;
}

function detectWalkaway(): boolean {
  return (
    runtime.agents.vendor?.state === "withdrawn" ||
    runtime.agents.customer?.state === "withdrawn"
  );
}

function detectTimeout(): boolean {
  if (!runtime.startedAt) return false;
  return Date.now() - Date.parse(runtime.startedAt) > HARD_TIMEOUT_MS;
}

function stopWatcher(): void {
  if (watcherHandle) {
    clearInterval(watcherHandle);
    watcherHandle = null;
  }
}

function startWatcher(): void {
  stopWatcher();
  watcherHandle = setInterval(() => {
    if (runtime.status !== "running") {
      stopWatcher();
      return;
    }
    if (detectAgreement()) {
      console.log("[runtime] agreement detected (promise convergence)");
      runtime.outcome = "agreement";
      runtime.status = "complete";
      abortController?.abort();
      stopWatcher();
      return;
    }
    if (detectWalkaway()) {
      console.log("[runtime] walkaway detected (party withdrew)");
      runtime.outcome = "walkaway";
      runtime.status = "complete";
      abortController?.abort();
      stopWatcher();
      return;
    }
    if (detectTimeout()) {
      console.log("[runtime] hard timeout reached");
      runtime.outcome = "timeout";
      runtime.status = "complete";
      abortController?.abort();
      stopWatcher();
    }
  }, WATCHER_INTERVAL_MS);
}

export async function startMediation(): Promise<void> {
  if (runtime.status === "running") {
    console.warn("[runtime] startMediation called while already running; ignoring");
    return;
  }

  if (abortController) abortController.abort();
  runtime = freshRuntime();
  abortController = new AbortController();

  const boundSpaceId = process.env.SPACEBASE_SPACE_ID;
  if (!boundSpaceId) {
    throw new Error(
      "SPACEBASE_SPACE_ID is not set; the wrapper requires a bound space"
    );
  }

  const scenarioPath = resolve(process.cwd(), "lib/scenario.md");
  const scenario = await readFile(scenarioPath, "utf8");

  // Each mediation runs inside its own interior sub-space. The scenario is
  // posted as a fresh top-level INTENT in the bound parent space, and the
  // agents scan and post against that intent's interior. Past mediations
  // stay sealed inside their own past parent intents and are invisible here.
  const scenarioPost = await postScenario({ content: scenario });
  if (!scenarioPost.intentId) {
    throw new Error("postScenario did not return an intentId");
  }
  const interior = await enter({ intentId: scenarioPost.intentId });

  runtime.spaceId = interior.spaceId;
  runtime.rootIntentId = scenarioPost.intentId;
  runtime.startedAt = new Date().toISOString();
  runtime.status = "running";

  const sharedArgs = {
    spaceId: interior.spaceId,
    scenario,
    abortSignal: abortController.signal,
  };

  const starters = [
    [startVendor, "vendor"],
    [startCustomer, "customer"],
    [startMediator, "mediator"],
    [startInsurance, "insurance"],
    [startRegulator, "regulator"],
  ] as const;

  for (const [start, id] of starters) {
    const onStateChange = makeStateCallback(id);
    const onPost = makePostCallback(id);
    void start({
      ...sharedArgs,
      onStateChange,
      onPost,
    }).catch((err) => {
      console.error(`[runtime] agent ${id} loop crashed:`, err);
    });
  }

  startWatcher();
  console.log(
    `[runtime] started; boundSpaceId=${boundSpaceId} rootIntentId=${scenarioPost.intentId} interiorSpaceId=${interior.spaceId}`
  );
}

export function stopMediation(): void {
  console.log("[runtime] stopMediation called");
  if (abortController) abortController.abort();
  runtime.status = "complete";
  stopWatcher();
}
