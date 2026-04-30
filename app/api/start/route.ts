import { getRuntime, startMediation } from "@/lib/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await startMediation();
    const state = getRuntime();
    return Response.json({
      ok: true,
      spaceId: state.spaceId,
      rootIntentId: state.rootIntentId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/start] failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
