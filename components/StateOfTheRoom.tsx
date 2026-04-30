"use client";

import type { Post, RuntimeState } from "@/types";

type Props = {
  state: RuntimeState;
};

const POSITION_STAGES = new Set(["intent", "promise", "revise"]);
const PARTY_IDS = new Set(["vendor", "customer"]);

function lastPositionPost(posts: Post[], authorId: string): Post | null {
  for (let i = posts.length - 1; i >= 0; i -= 1) {
    const p = posts[i];
    if (p.authorId === authorId && POSITION_STAGES.has(p.stage)) return p;
  }
  return null;
}

function lastPostBy(posts: Post[], authorId: string): Post | null {
  for (let i = posts.length - 1; i >= 0; i -= 1) {
    if (posts[i].authorId === authorId) return posts[i];
  }
  return null;
}

function lastPartyPostByStage(posts: Post[], stage: string): Post | null {
  for (let i = posts.length - 1; i >= 0; i -= 1) {
    const p = posts[i];
    if (PARTY_IDS.has(p.authorId) && p.stage === stage) return p;
  }
  return null;
}

function PositionCard({
  label,
  post,
  emptyText,
}: {
  label: string;
  post: Post | null;
  emptyText: string;
}) {
  return (
    <div className="rounded border border-[#e5e3dc] bg-white p-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6b6b6b]">
        {label}
      </p>
      {post ? (
        <>
          <p className="font-serif text-base leading-relaxed text-[#1c1c1c]">
            {post.content}
          </p>
          <p className="mt-2 text-xs text-[#888]">stage: {post.stage}</p>
        </>
      ) : (
        <p className="text-sm italic text-[#6b6b6b]">{emptyText}</p>
      )}
    </div>
  );
}

function OutcomeCard({
  title,
  body,
  borderColor,
  authorName,
}: {
  title: string;
  body: string;
  borderColor: string;
  authorName: string;
}) {
  return (
    <div
      className="rounded border-2 bg-white p-6"
      style={{ borderColor }}
    >
      <p
        className="mb-2 text-xs font-bold uppercase tracking-wider"
        style={{ color: borderColor }}
      >
        {title}
      </p>
      <p className="font-serif text-base leading-relaxed text-[#1c1c1c]">
        {body}
      </p>
      <p className="mt-3 text-xs text-[#888]">posted by {authorName}</p>
    </div>
  );
}

export default function StateOfTheRoom({ state }: Props) {
  const sorted = [...state.posts].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
  const vendorPosition = lastPositionPost(sorted, "vendor");
  const customerPosition = lastPositionPost(sorted, "customer");
  const mediatorLast = lastPostBy(sorted, "mediator");

  const settlementPost =
    state.outcome === "agreement"
      ? lastPartyPostByStage(sorted, "promise")
      : null;
  const walkawayPost =
    state.outcome === "walkaway"
      ? lastPartyPostByStage(sorted, "release")
      : null;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-[#1c1c1c]">State of the Room</h2>
        <p className="text-sm text-[#6b6b6b] mt-1">
          Inferred from the space. Not enforced.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
        {settlementPost && (
          <OutcomeCard
            title="Settlement"
            body={settlementPost.content}
            borderColor="#2f7a4a"
            authorName={settlementPost.authorName}
          />
        )}
        {walkawayPost && (
          <OutcomeCard
            title="Mediation closed without agreement"
            body={walkawayPost.content}
            borderColor="#a04a3a"
            authorName={walkawayPost.authorName}
          />
        )}
        <PositionCard
          label="Vendor's position"
          post={vendorPosition}
          emptyText="Awaiting first move."
        />
        <PositionCard
          label="Customer's position"
          post={customerPosition}
          emptyText="Awaiting first move."
        />
        <PositionCard
          label="Mediator's last framing"
          post={mediatorLast}
          emptyText="Mediator is observing."
        />
      </div>
    </section>
  );
}
