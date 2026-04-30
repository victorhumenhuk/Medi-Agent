/*
 * Shared types for the mediation room.
 *
 * Stage values are the project's five ITP stages. The wrapper translates
 * them to the SDK's typed messages. The runtime, UI, and prompts only
 * ever think in these five stages.
 */

export type ITPStage = "intent" | "promise" | "revise" | "assess" | "release";

export type Post = {
  id: string;
  intentId: string;
  seq: number;
  parentId?: string;
  refersTo?: string;
  authorId: string;
  authorName: string;
  stage: ITPStage;
  content: string;
  timestamp: string;
};

export type AgentState =
  | "idle"
  | "scanning"
  | "drafting"
  | "posted"
  | "silent"
  | "declined"
  | "withdrawn";

export type Agent = {
  id: string;
  name: string;
  role: string;
  state: AgentState;
  lastActionAt?: string;
  postCount: number;
  hasEnteredRoom: boolean;
  lastSeqSeen: number;
};

export type RuntimeState = {
  spaceId?: string;
  rootIntentId?: string;
  agents: Record<string, Agent>;
  posts: Post[];
  startedAt?: string;
  status: "idle" | "running" | "complete";
  outcome?: "agreement" | "walkaway" | "timeout";
};
