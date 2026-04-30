import { runAgent } from "./base";
import type { AgentStartArgs } from "./vendor";

export function startRegulator(args: AgentStartArgs) {
  return runAgent({
    agentId: "regulator",
    agentName: "Regulator",
    promptPath: "lib/prompts/regulator.md",
    model: "claude-haiku",
    ...args,
  });
}
