import { getRuntime } from "@/lib/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = getRuntime();
  return Response.json(state, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
