import { runAgent } from "./base";
import type { AgentStartArgs } from "./vendor";

export function startCustomer(args: AgentStartArgs) {
  return runAgent({
    agentId: "customer",
    agentName: "Customer Counsel",
    promptPath: "lib/prompts/customer.md",
    model: "claude-sonnet",
    ...args,
  });
}
