import { stopMediation } from "@/lib/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    stopMediation();
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/stop] failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
