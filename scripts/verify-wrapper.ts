/*
 * Verification script for lib/intent-space.ts.
 *
 * 1. Loads .env.local so the Python bridge sees the Spacebase1 credentials.
 * 2. Calls scan against the bound space and prints what it sees (the steward's
 *    orientation message at minimum).
 * 3. Posts a verification INTENT.
 * 4. Calls scan again (since=0 to grab everything, then filter for the new
 *    post by intentId) and confirms the new post appears.
 * 5. Prints a clear pass or fail line at the end.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import type { Post } from "../types";
import { post, scan } from "../lib/intent-space";

loadDotenv({ path: resolve(process.cwd(), ".env.local") });

const SPACE_ID = process.env.SPACEBASE_SPACE_ID ?? "<unset>";
const VERIFICATION_CONTENT =
  "Wrapper verification post from Medi-Agent. Test only.";

function summarise(p: Post): string {
  return `seq=${p.seq} stage=${p.stage} id=${p.intentId} parent=${
    p.parentId ?? "<none>"
  } author=${p.authorName} content=${JSON.stringify(p.content).slice(0, 120)}`;
}

async function main() {
  console.log("=== Spacebase1 wrapper verification ===");
  console.log(`bound space: ${SPACE_ID}`);
  console.log("");

  console.log("Step 1: initial scan (since=0)...");
  const initial = await scan({ since: 0 });
  console.log(`  latestSeq: ${initial.latestSeq}`);
  console.log(`  posts visible: ${initial.posts.length}`);
  for (const p of initial.posts) {
    console.log(`    - ${summarise(p)}`);
  }
  console.log("");

  if (initial.posts.length === 0) {
    console.error("FAIL: expected at least the steward intent in the bound space");
    process.exit(1);
  }

  console.log("Step 2: posting verification INTENT...");
  const posted = await post({
    stage: "intent",
    content: VERIFICATION_CONTENT,
  });
  console.log(`  posted intentId: ${posted.intentId}`);
  console.log("");

  console.log("Step 3: rescanning to confirm the new post is visible...");
  const after = await scan({ since: 0 });
  console.log(`  latestSeq: ${after.latestSeq}`);
  console.log(`  posts visible: ${after.posts.length}`);

  const found = after.posts.find((p) => p.intentId === posted.intentId);
  if (!found) {
    console.log("");
    console.log("All posts seen on rescan:");
    for (const p of after.posts) {
      console.log(`    - ${summarise(p)}`);
    }
    console.error("");
    console.error(
      `FAIL: did not find verification post (intentId=${posted.intentId}) on rescan`
    );
    process.exit(1);
  }

  console.log("  Found verification post:");
  console.log(`    ${summarise(found)}`);
  console.log("");

  if (after.latestSeq <= initial.latestSeq) {
    console.warn(
      `WARN: latestSeq did not increase after the post (before=${initial.latestSeq}, after=${after.latestSeq}); this is unexpected but the post is visible by intentId.`
    );
  }

  console.log("PASS: scan, post, and rescan all succeeded.");
}

main().catch((err) => {
  console.error("");
  console.error("FAIL: verification threw an exception:");
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
