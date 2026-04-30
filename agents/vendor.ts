import type { AgentState, Post } from "@/types";
import { runAgent } from "./base";

export type AgentStartArgs = {
  spaceId: string;
  scenario: string;
  onStateChange: (state: AgentState) => void;
  onPost: (post: Post) => void;
  abortSignal: AbortSignal;
};

export function startVendor(args: AgentStartArgs) {
  return runAgent({
    agentId: "vendor",
    agentName: "Vendor Counsel",
    promptPath: "lib/prompts/vendor.md",
    model: "claude-sonnet",
    ...args,
  });
}
