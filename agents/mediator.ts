import { runAgent } from "./base";
import type { AgentStartArgs } from "./vendor";

export function startMediator(args: AgentStartArgs) {
  return runAgent({
    agentId: "mediator",
    agentName: "Mediator",
    promptPath: "lib/prompts/mediator.md",
    model: "claude-sonnet",
    ...args,
  });
}
