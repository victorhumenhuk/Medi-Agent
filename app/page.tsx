"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import IntentSpaceLog from "@/components/IntentSpaceLog";
import AgentsPanel from "@/components/AgentsPanel";
import StateOfTheRoom from "@/components/StateOfTheRoom";
import type { RuntimeState } from "@/types";

const POLL_INTERVAL_MS = 1500;

const INITIAL_STATE: RuntimeState = {
  status: "idle",
  posts: [],
  agents: {},
};

type BannerStyle = {
  text: string;
  bg: string;
};

function bannerFor(state: RuntimeState): BannerStyle | null {
  if (state.status === "idle") return null;
  if (state.outcome === "agreement") {
    return { text: "Agreement reached", bg: "#2f7a4a" };
  }
  if (state.outcome === "walkaway") {
    return { text: "Mediation ended without agreement", bg: "#c08a2a" };
  }
  if (state.outcome === "timeout") {
    return { text: "Time elapsed", bg: "#6b6b6b" };
  }
  if (state.status === "running") {
    return { text: "In progress", bg: "#3b5b8c" };
  }
  return null;
}

export default function Page() {
  const [state, setState] = useState<RuntimeState>(INITIAL_STATE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as RuntimeState;
        if (!cancelled) setState(data);
      } catch {
        // network blip; the next interval tick will retry
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/start", { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/stop", { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    window.location.reload();
  }

  const postCount = state.posts.length;
  const engagedCount = useMemo(
    () => Object.values(state.agents).filter((a) => a.postCount > 0).length,
    [state.agents]
  );
  const banner = bannerFor(state);

  return (
    <div className="flex h-screen flex-col bg-[#f8f7f4]">
      <Header
        status={state.status}
        postCount={postCount}
        engagedCount={engagedCount}
        onStart={start}
        onStop={stop}
        onReset={reset}
      />
      <main className="grid min-h-0 flex-1 grid-cols-[40%_30%_30%] gap-8 overflow-hidden p-8">
        <IntentSpaceLog posts={state.posts} rootSpaceId={state.spaceId} />
        <AgentsPanel agents={state.agents} />
        <StateOfTheRoom state={state} />
      </main>
      {banner && (
        <div
          className="border-t border-black/10 px-8 py-5 text-center text-2xl font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: banner.bg }}
        >
          {banner.text}
        </div>
      )}
    </div>
  );
}
