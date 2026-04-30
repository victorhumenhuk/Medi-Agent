"use client";

import type { Agent, AgentState } from "@/types";
import { formatRelative } from "@/lib/format";

const AGENT_ORDER = [
  "vendor",
  "customer",
  "mediator",
  "insurance",
  "regulator",
] as const;

type Props = {
  agents: Record<string, Agent>;
};

function StateBadge({ state }: { state: AgentState }) {
  switch (state) {
    case "scanning":
      return (
        <span className="soft-pulse rounded bg-[#3b5b8c] px-2.5 py-1 text-xs font-semibold text-white">
          Scanning
        </span>
      );
    case "drafting":
      return (
        <span className="soft-pulse rounded bg-[#c08a2a] px-2.5 py-1 text-xs font-semibold text-white">
          Drafting
        </span>
      );
    case "posted":
      return (
        <span className="rounded bg-[#2f7a4a] px-2.5 py-1 text-xs font-semibold text-white">
          Posted
        </span>
      );
    case "silent":
      return (
        <span className="rounded bg-[#e5e3dc] px-2.5 py-1 text-xs font-semibold text-[#6b6b6b]">
          Silent this turn
        </span>
      );
    case "declined":
      return (
        <span className="rounded bg-[#3a3a3a] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
          Observed, did not engage
        </span>
      );
    case "withdrawn":
      return (
        <span className="rounded bg-[#a04a3a] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
          Withdrew from mediation
        </span>
      );
    case "idle":
    default:
      return (
        <span className="rounded bg-[#e5e3dc] px-2.5 py-1 text-xs font-semibold text-[#6b6b6b]">
          Idle
        </span>
      );
  }
}

export default function AgentsPanel({ agents }: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-[#1c1c1c]">Agents</h2>
        <p className="text-sm text-[#6b6b6b] mt-1">
          Each decides for itself. Each scans on its own schedule.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
        {AGENT_ORDER.map((id) => {
          const agent = agents[id];
          if (!agent) return null;
          const isDeclined = agent.state === "declined";
          const isWithdrawn = agent.state === "withdrawn";
          const cardClass = [
            "rounded bg-white p-6 transition-opacity",
            isWithdrawn
              ? "border-2 border-[#a04a3a]"
              : "border border-[#e5e3dc]",
            isDeclined ? "opacity-50" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <article key={id} className={cardClass}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[#1c1c1c]">{agent.name}</p>
                  <p className="text-xs text-[#6b6b6b]">{agent.role}</p>
                </div>
                <StateBadge state={agent.state} />
              </div>
              <div className="flex items-center justify-between text-xs text-[#6b6b6b]">
                <span>
                  {agent.lastActionAt
                    ? `last action ${formatRelative(agent.lastActionAt)}`
                    : "no activity yet"}
                </span>
                <span>
                  {agent.postCount} post{agent.postCount === 1 ? "" : "s"}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
