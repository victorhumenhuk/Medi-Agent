/*
 * Env override shim.
 *
 * Claude Code injects ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL into the shell.
 * Next.js's built-in env loader does not override existing process env, so the
 * project's .env.local values are silently shadowed when npm run dev is run
 * from a Claude Code shell. This shim explicitly reloads .env.local with
 * override:true and removes ANTHROPIC_BASE_URL so the Anthropic SDK targets
 * the public API.
 *
 * Imported for its side effect by lib/agent-runtime.ts. Idempotent.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

let applied = false;

export function ensureEnvLoaded(): void {
  if (applied) return;
  applied = true;
  const result = loadDotenv({
    path: resolve(process.cwd(), ".env.local"),
    override: true,
  });
  if (result.error) {
    console.warn(`[env] could not load .env.local: ${result.error.message}`);
    return;
  }
  if (process.env.ANTHROPIC_BASE_URL) {
    console.log(
      "[env] removing ANTHROPIC_BASE_URL so the Anthropic SDK targets the public API"
    );
    delete process.env.ANTHROPIC_BASE_URL;
  }
  console.log("[env] .env.local loaded with override");
}

ensureEnvLoaded();
