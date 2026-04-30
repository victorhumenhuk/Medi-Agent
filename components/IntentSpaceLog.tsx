"use client";

import type { Post } from "@/types";
import { formatRelative } from "@/lib/format";

const STAGE_COLORS: Record<string, string> = {
  intent: "#3b5b8c",
  promise: "#2f7a4a",
  revise: "#c08a2a",
  assess: "#5e3b8c",
  release: "#a04a3a",
};

type Props = {
  posts: Post[];
  rootSpaceId?: string;
};

function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + "...";
}

export default function IntentSpaceLog({ posts, rootSpaceId }: Props) {
  const newestFirst = [...posts].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );
  const byIntentId = new Map(posts.map((p) => [p.intentId, p]));

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-[#1c1c1c]">Intent Space</h2>
        <p className="text-sm text-[#6b6b6b] mt-1">
          Append-only. Pull-based. Five lifecycle stages.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
        {newestFirst.length === 0 && (
          <p className="text-sm italic text-[#6b6b6b]">
            No posts yet. Click Start Mediation to drop the dispute scenario into the space.
          </p>
        )}
        {newestFirst.map((post) => {
          const isReply =
            post.parentId !== undefined && post.parentId !== rootSpaceId;
          const parent = isReply ? byIntentId.get(post.parentId!) : undefined;
          return (
            <article
              key={post.id}
              className="fade-in rounded border border-[#e5e3dc] bg-white p-6"
            >
              <div className="mb-2 flex items-center gap-3 text-xs">
                <span
                  className="rounded-full px-2.5 py-0.5 font-semibold uppercase tracking-wide text-white"
                  style={{ backgroundColor: STAGE_COLORS[post.stage] ?? "#888" }}
                >
                  {post.stage}
                </span>
                <span className="font-bold text-[#1c1c1c]">
                  {post.authorName}
                </span>
                <span className="text-[#888]">
                  {formatRelative(post.timestamp)}
                </span>
              </div>
              <p className="font-serif text-base leading-relaxed text-[#1c1c1c]">
                {post.content}
              </p>
              {isReply && (
                <p className="ml-3 mt-3 border-l-2 border-[#e5e3dc] pl-3 text-xs text-[#6b6b6b]">
                  in reply to:{" "}
                  {parent
                    ? truncate(parent.content, 60)
                    : truncate(String(post.parentId), 40)}
                </p>
              )}
              {post.refersTo && (
                <p className="ml-3 mt-1 border-l-2 border-[#e5e3dc] pl-3 text-xs text-[#6b6b6b]">
                  refers to: {truncate(post.refersTo, 32)}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
