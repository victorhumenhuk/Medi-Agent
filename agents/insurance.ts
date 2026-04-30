import { runAgent } from "./base";
import type { AgentStartArgs } from "./vendor";

export function startInsurance(args: AgentStartArgs) {
  return runAgent({
    agentId: "insurance",
    agentName: "Insurance Specialist",
    promptPath: "lib/prompts/insurance.md",
    model: "claude-haiku",
    ...args,
  });
}
