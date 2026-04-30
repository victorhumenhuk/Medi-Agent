/*
 * Base agent loop. Identical for all five agents. Role differs only by the
 * promptPath and model passed in. There are no role-specific branches in
 * this file; if you find yourself reaching for one, the role prompt is the
 * place to put that decision.
 *
 * Loop: scan -> decide -> post or skip -> sleep 3s -> repeat.
 * The decision is taken by the LLM. The runtime here only enforces:
 *   - the integer cursor (lastSeqSeen) so each scan only pulls new posts
 *   - a hard 5-minute timeout as a safety net (the protocol-correct end is
 *     emergent: agreement, walkaway, or this timeout)
 *   - a "declined" early exit after 3 consecutive skips with no post ever
 *   - a "withdrawn" exit after posting a release with withdrawal language
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { callLLM, type LLMModel } from "@/lib/llm";
import { post as spacePost, scan as spaceScan } from "@/lib/intent-space";
import type { AgentState, ITPStage, Post } from "@/types";

const LOOP_INTERVAL_MS = 3000;
const HARD_TIMEOUT_MS = 5 * 60 * 1000;
const CONSECUTIVE_SKIP_LIMIT = 3;
const RECENT_POSTS_LIMIT = 20;
const WITHDRAWAL_PATTERNS = [
  "withdraw",
  "cannot accept",
  "ending my participation",
];

type LLMDecision =
  | {
      action: "post";
      stage: ITPStage;
      content: string;
      parentId?: string;
      refersTo?: string;
    }
  | { action: "skip"; reason?: string }
  | { action: "invalid"; reason: string };

function stripMarkdownFences(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return s.trim();
}

function parseDecision(raw: string): LLMDecision {
  const stripped = stripMarkdownFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return {
      action: "invalid",
      reason: `not JSON: ${raw.slice(0, 200).replace(/\s+/g, " ")}`,
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return { action: "invalid", reason: "JSON not an object" };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.action === "skip") {
    return {
      action: "skip",
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
    };
  }
  if (obj.action !== "post") {
    return {
      action: "invalid",
      reason: `unknown action: ${String(obj.action)}`,
    };
  }
  const { stage, content } = obj;
  if (typeof content !== "string" || content.length === 0) {
    return { action: "invalid", reason: "content must be a non-empty string" };
  }
  if (
    stage !== "intent" &&
    stage !== "promise" &&
    stage !== "revise" &&
    stage !== "assess" &&
    stage !== "release"
  ) {
    return { action: "invalid", reason: `unknown stage: ${String(stage)}` };
  }
  return {
    action: "post",
    stage,
    content,
    parentId:
      typeof obj.parentId === "string" && obj.parentId
        ? obj.parentId
        : undefined,
    refersTo:
      typeof obj.refersTo === "string" && obj.refersTo
        ? obj.refersTo
        : undefined,
  };
}

function looksLikeWithdrawal(content: string): boolean {
  const lower = content.toLowerCase();
  return WITHDRAWAL_PATTERNS.some((p) => lower.includes(p));
}

function buildUserMessage(scenario: string, recentPosts: Post[]): string {
  const lastN = recentPosts.slice(-RECENT_POSTS_LIMIT);
  const rendered = lastN.map((p) => ({
    seq: p.seq,
    intentId: p.intentId,
    parentId: p.parentId ?? null,
    refersTo: p.refersTo ?? null,
    author: p.authorName,
    stage: p.stage,
    content: p.content,
  }));
  return [
    "## Dispute scenario",
    "",
    scenario.trim(),
    "",
    `## Recent posts in the shared space (oldest first, last ${lastN.length} of ${recentPosts.length} visible)`,
    "",
    JSON.stringify(rendered, null, 2),
    "",
    "Decide whether to post or skip and return the JSON object as specified in your role's output contract.",
  ].join("\n");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveSleep, rejectSleep) => {
    if (signal.aborted) {
      rejectSleep(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolveSleep();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      rejectSleep(new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runAgent(config: {
  agentId: string;
  agentName: string;
  promptPath: string;
  model: LLMModel;
  spaceId: string;
  scenario: string;
  onStateChange: (state: AgentState) => void;
  onPost: (post: Post) => void;
  abortSignal: AbortSignal;
}): Promise<void> {
  const tag = `[agent:${config.agentId}]`;
  const promptAbsPath = resolve(process.cwd(), config.promptPath);
  const rolePrompt = await readFile(promptAbsPath, "utf8");

  let lastSeqSeen = 0;
  let consecutiveSkips = 0;
  let hasEverPosted = false;
  const visiblePosts: Post[] = [];
  const startedAt = Date.now();

  const declineIfExhausted = (): boolean => {
    if (consecutiveSkips >= CONSECUTIVE_SKIP_LIMIT && !hasEverPosted) {
      console.log(
        `${tag} declined after ${consecutiveSkips} consecutive skips with no post`
      );
      config.onStateChange("declined");
      return true;
    }
    return false;
  };

  while (!config.abortSignal.aborted) {
    if (Date.now() - startedAt > HARD_TIMEOUT_MS) {
      console.log(`${tag} hard timeout after ${HARD_TIMEOUT_MS}ms; exiting`);
      return;
    }

    try {
      config.onStateChange("scanning");
      const scanResult = await spaceScan({
        spaceId: config.spaceId,
        since: lastSeqSeen,
      });
      for (const p of scanResult.posts) visiblePosts.push(p);
      lastSeqSeen = Math.max(lastSeqSeen, scanResult.latestSeq);

      config.onStateChange("drafting");
      const userMessage = buildUserMessage(config.scenario, visiblePosts);
      const raw = await callLLM({
        systemPrompt: rolePrompt,
        userMessage,
        model: config.model,
        agentName: config.agentName,
      });
      const decision = parseDecision(raw);

      if (decision.action === "invalid") {
        console.warn(`${tag} invalid LLM output: ${decision.reason}`);
        consecutiveSkips++;
        if (declineIfExhausted()) return;
        config.onStateChange("silent");
      } else if (decision.action === "skip") {
        console.log(`${tag} skip: ${decision.reason ?? "<no reason>"}`);
        consecutiveSkips++;
        if (declineIfExhausted()) return;
        config.onStateChange("silent");
      } else if (
        (decision.stage === "promise" ||
          decision.stage === "assess" ||
          decision.stage === "revise") &&
        !decision.refersTo
      ) {
        console.warn(
          `${tag} stage '${decision.stage}' missing refersTo; treating as skip`
        );
        consecutiveSkips++;
        if (declineIfExhausted()) return;
        config.onStateChange("silent");
      } else {
        const result = await spacePost({
          spaceId: config.spaceId,
          stage: decision.stage,
          content: decision.content,
          parentId: decision.parentId,
          refersTo: decision.refersTo,
        });
        consecutiveSkips = 0;
        hasEverPosted = true;

        const constructedPost: Post = {
          id: result.id,
          intentId: result.intentId ?? result.id,
          seq: 0,
          parentId: decision.parentId,
          refersTo: decision.refersTo,
          authorId: config.agentId,
          authorName: config.agentName,
          stage: decision.stage,
          content: decision.content,
          timestamp: new Date().toISOString(),
        };
        config.onPost(constructedPost);
        config.onStateChange("posted");

        if (
          decision.stage === "release" &&
          looksLikeWithdrawal(decision.content)
        ) {
          console.log(
            `${tag} posted release with withdrawal language; exiting as withdrawn`
          );
          config.onStateChange("withdrawn");
          return;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "aborted") {
        console.log(`${tag} aborted`);
        return;
      }
      console.error(`${tag} loop iteration failed: ${msg}`);
    }

    try {
      await sleep(LOOP_INTERVAL_MS, config.abortSignal);
    } catch {
      return;
    }
  }
}
