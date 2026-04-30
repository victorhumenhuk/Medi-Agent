"use client";

const OBSERVATORY_URL =
  process.env.NEXT_PUBLIC_SPACEBASE_OBSERVATORY_URL ?? "";

type Props = {
  status: "idle" | "running" | "complete";
  postCount: number;
  engagedCount: number;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
};

export default function Header({
  status,
  postCount,
  engagedCount,
  onStart,
  onStop,
  onReset,
}: Props) {
  return (
    <header className="border-b border-[#e5e3dc] bg-white px-8 py-5">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h1 className="font-serif text-3xl text-[#1c1c1c]">Mediation Room</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">
            A body of desire. Five agents. No coordinator.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {status === "idle" && (
            <button
              onClick={onStart}
              className="rounded bg-[#2f7a4a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#236035] transition-colors"
            >
              Start Mediation
            </button>
          )}
          {status === "running" && (
            <button
              onClick={onStop}
              className="rounded bg-[#a04a3a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#7d3a2d] transition-colors"
            >
              Stop
            </button>
          )}
          {status === "complete" && (
            <button
              onClick={onReset}
              className="rounded bg-[#3b5b8c] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2c476f] transition-colors"
            >
              Reset
            </button>
          )}
          {OBSERVATORY_URL && (
            <a
              href={OBSERVATORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#6b6b6b] underline underline-offset-2 hover:text-[#1c1c1c]"
            >
              View live Observatory
            </a>
          )}
          <span className="text-xs text-[#888] tabular-nums">
            {postCount} {postCount === 1 ? "post" : "posts"} &middot;{" "}
            {engagedCount} {engagedCount === 1 ? "agent" : "agents"} engaged
          </span>
        </div>
      </div>
    </header>
  );
}
