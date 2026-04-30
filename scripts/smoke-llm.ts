/*
 * Quick check that the model IDs we resolve to are accepted by the current
 * Anthropic SDK. We do not call the OpenAI model here; if the OpenAI key is
 * missing the gpt-4o-mini check is skipped with a note.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { callLLM } from "../lib/llm";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true });
delete process.env.ANTHROPIC_BASE_URL;

async function tryModel(model: "claude-sonnet" | "claude-haiku" | "gpt-4o-mini") {
  const need =
    model === "gpt-4o-mini" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  if (!process.env[need]) {
    console.log(`[skip] ${model}: ${need} not set`);
    return;
  }
  try {
    const text = await callLLM({
      systemPrompt: "Reply with the single word PONG.",
      userMessage: "ping",
      model,
      agentName: `smoke:${model}`,
    });
    console.log(`[ok]   ${model} -> ${JSON.stringify(text.slice(0, 80))}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[fail] ${model}: ${msg}`);
  }
}

(async () => {
  await tryModel("claude-sonnet");
  await tryModel("claude-haiku");
  await tryModel("gpt-4o-mini");
})();
