/*
 * Single-shot LLM helper.
 * Returns the raw response text. Callers parse JSON themselves.
 *
 * The agent name is optional and used only for log lines so we can tell
 * which agent's loop produced each call. Logging covers the four numbers
 * worth seeing: model, prompt length, response length, and latency.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type LLMModel = "claude-sonnet" | "claude-haiku" | "gpt-4o-mini";

const CLAUDE_SONNET_ID = "claude-sonnet-4-5-20250929";
const CLAUDE_HAIKU_ID = "claude-haiku-4-5-20251001";
const OPENAI_MINI_ID = "gpt-4o-mini";

const MAX_TOKENS = 800;
const TEMPERATURE = 0.7;

let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

function anthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function openai(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function resolveModelId(model: LLMModel): string {
  switch (model) {
    case "claude-sonnet":
      return CLAUDE_SONNET_ID;
    case "claude-haiku":
      return CLAUDE_HAIKU_ID;
    case "gpt-4o-mini":
      return OPENAI_MINI_ID;
  }
}

async function callClaude(args: {
  systemPrompt: string;
  userMessage: string;
  modelId: string;
}): Promise<string> {
  const response = await anthropic().messages.create({
    model: args.modelId,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: args.systemPrompt,
    messages: [{ role: "user", content: args.userMessage }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  return text;
}

async function callOpenAI(args: {
  systemPrompt: string;
  userMessage: string;
  modelId: string;
}): Promise<string> {
  const response = await openai().chat.completions.create({
    model: args.modelId,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userMessage },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

export async function callLLM(args: {
  systemPrompt: string;
  userMessage: string;
  model: LLMModel;
  agentName?: string;
}): Promise<string> {
  const modelId = resolveModelId(args.model);
  const promptLength = args.systemPrompt.length + args.userMessage.length;
  const startedAt = Date.now();
  const tag = args.agentName ?? "anon";

  try {
    const text =
      args.model === "gpt-4o-mini"
        ? await callOpenAI({
            systemPrompt: args.systemPrompt,
            userMessage: args.userMessage,
            modelId,
          })
        : await callClaude({
            systemPrompt: args.systemPrompt,
            userMessage: args.userMessage,
            modelId,
          });
    const latency = Date.now() - startedAt;
    console.log(
      `[llm] agent=${tag} model=${modelId} promptLen=${promptLength} responseLen=${text.length} latencyMs=${latency}`
    );
    return text;
  } catch (err) {
    const latency = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[llm] agent=${tag} model=${modelId} promptLen=${promptLength} latencyMs=${latency} error=${message}`
    );
    throw err;
  }
}
