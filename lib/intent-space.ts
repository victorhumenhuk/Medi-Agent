/*
 * Intent Space wrapper.
 * The space is a body of desire, not a workflow engine.
 * Operations: post (append a typed declaration), scan (pull visible history), enter (open an interior space).
 * The space holds visible declarations only. It does not track promise lifecycle truth.
 * Promise lifecycle truth lives in agent-local state.
 *
 * Implementation: shells out to the installed Python SDK to handle DPoP signing and ITP framing.
 * The SDK reference is at ~/.claude/skills/intent-space-agent-pack/sdk/.
 *
 * Note: the SDK exposes INTENT, PROMISE, DECLINE, ACCEPT, COMPLETE, ASSESS.
 * The project's five ITP stages map as follows:
 *   intent   -> INTENT
 *   promise  -> PROMISE (requires refersTo as intentId)
 *   assess   -> ASSESS (requires refersTo as promiseId)
 *   revise   -> INTENT with payload.stage="revise" and payload.refersTo
 *   release  -> INTENT with payload.stage="release" and optional payload.refersTo
 * REVISE and RELEASE are not native SDK message types in this version.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { ITPStage, Post } from "@/types";

const BRIDGE_SCRIPT = resolve(process.cwd(), "scripts/space_bridge.py");

type BridgeOk<T> = { ok: true; result: T };
type BridgeErr = {
  ok: false;
  error: string;
  errorType?: string;
  trace?: string;
};
type BridgeResponse<T> = BridgeOk<T> | BridgeErr;

type RawMessage = {
  type: string;
  intentId?: string;
  promiseId?: string;
  parentId?: string;
  senderId?: string;
  timestamp?: number;
  seq?: number;
  payload?: Record<string, unknown>;
};

type ScanResult = {
  spaceId: string;
  latestSeq: number;
  messages: RawMessage[];
};

type PostResult = {
  id: string;
  intentId?: string;
  promiseId?: string;
  type: string;
  parentId: string;
  senderId?: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
};

function callBridge<T>(command: Record<string, unknown>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("python3", [BRIDGE_SCRIPT], {
      env: {
        ...process.env,
        SPACEBASE_WORKSPACE: process.cwd(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      rejectPromise(new Error(`failed to spawn python3: ${err.message}`));
    });

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (!stdout) {
        rejectPromise(
          new Error(
            `space_bridge produced no stdout (exit ${code}). stderr: ${stderr || "<empty>"}`
          )
        );
        return;
      }
      let parsed: BridgeResponse<T>;
      try {
        parsed = JSON.parse(stdout) as BridgeResponse<T>;
      } catch (err) {
        rejectPromise(
          new Error(
            `space_bridge stdout was not JSON (exit ${code}): ${stdout}\nstderr: ${stderr}`
          )
        );
        return;
      }
      if (!parsed.ok) {
        const trace = parsed.trace ? `\n${parsed.trace}` : "";
        rejectPromise(
          new Error(
            `space_bridge error (${parsed.errorType ?? "Error"}): ${parsed.error}${trace}`
          )
        );
        return;
      }
      resolvePromise(parsed.result);
    });

    child.stdin.write(JSON.stringify(command));
    child.stdin.end();
  });
}

function deriveStage(message: RawMessage): ITPStage {
  const payloadStage =
    message.payload && typeof message.payload.stage === "string"
      ? (message.payload.stage as string)
      : null;

  switch (message.type) {
    case "INTENT":
      if (payloadStage === "revise") return "revise";
      if (payloadStage === "release") return "release";
      return "intent";
    case "PROMISE":
      return "promise";
    case "ASSESS":
      return "assess";
    case "DECLINE":
      return "release";
    case "ACCEPT":
    case "COMPLETE":
    default:
      return "intent";
  }
}

function deriveContent(message: RawMessage): string {
  const payload = message.payload ?? {};
  const candidates = [
    payload.content,
    payload.summary,
    payload.assessment,
    payload.reason,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return "";
}

function deriveRefersTo(message: RawMessage): string | undefined {
  const payload = message.payload ?? {};
  if (typeof payload.refersTo === "string" && payload.refersTo) {
    return payload.refersTo;
  }
  if (message.type === "PROMISE" && typeof message.intentId === "string") {
    return message.intentId;
  }
  if (
    (message.type === "ASSESS" || message.type === "ACCEPT" || message.type === "COMPLETE") &&
    typeof message.promiseId === "string"
  ) {
    return message.promiseId;
  }
  return undefined;
}

function toPost(message: RawMessage): Post {
  const id = (message.intentId || message.promiseId || "") as string;
  return {
    id,
    intentId: id,
    seq: typeof message.seq === "number" ? message.seq : 0,
    parentId: message.parentId,
    refersTo: deriveRefersTo(message),
    authorId: message.senderId ?? "unknown",
    authorName: message.senderId ?? "unknown",
    stage: deriveStage(message),
    content: deriveContent(message),
    timestamp:
      typeof message.timestamp === "number"
        ? new Date(message.timestamp).toISOString()
        : new Date().toISOString(),
  };
}

export async function scan(args: {
  spaceId?: string;
  since?: number;
}): Promise<{ posts: Post[]; latestSeq: number }> {
  const result = await callBridge<ScanResult>({
    op: "scan",
    spaceId: args.spaceId,
    since: args.since ?? 0,
  });
  const posts = (result.messages ?? []).map(toPost);
  return { posts, latestSeq: result.latestSeq ?? 0 };
}

export async function post(args: {
  stage: ITPStage;
  content: string;
  spaceId?: string;
  parentId?: string;
  refersTo?: string;
}): Promise<{ id: string; intentId?: string; promiseId?: string }> {
  if ((args.stage === "promise" || args.stage === "assess" || args.stage === "revise") && !args.refersTo) {
    throw new Error(
      `stage '${args.stage}' requires refersTo; the wrapper rejects this call before it reaches the SDK`
    );
  }

  // If the caller does not supply a parentId, the bridge defaults the parent
  // to the spaceId the agent is currently running in (top-level post in that
  // sub-space), falling back to the bound space from env only if neither is
  // provided.
  const result = await callBridge<PostResult>({
    op: "post",
    stage: args.stage,
    content: args.content,
    spaceId: args.spaceId,
    parentId: args.parentId,
    refersTo: args.refersTo,
  });

  return {
    id: result.id,
    intentId: result.intentId,
    promiseId: result.promiseId,
  };
}

export async function postScenario(args: {
  content: string;
}): Promise<{ id: string; intentId?: string }> {
  const result = await callBridge<PostResult>({
    op: "postScenario",
    content: args.content,
  });
  return { id: result.id, intentId: result.intentId };
}

/**
 * Enter the interior space of an intent. In this protocol every intent is
 * itself a parent space: replies that narrow the subject use the intent's id
 * as their parentId. There is no separate server call to "open" an interior;
 * we simply return the id callers should use as the parent.
 */
export async function enter(args: { intentId: string }): Promise<{ spaceId: string }> {
  if (!args.intentId) {
    throw new Error("enter requires an intentId");
  }
  return { spaceId: args.intentId };
}
