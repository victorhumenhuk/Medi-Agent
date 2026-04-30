#!/usr/bin/env python3
"""Bridge between the Node wrapper and the Spacebase1 Python SDK.

Reads one JSON command from stdin, performs one operation against the
bound space, and writes one JSON line to stdout. Exits non-zero on error.

Commands accepted via stdin:
  {"op": "scan",         "spaceId"?: str, "since"?: int}
  {"op": "post",         "stage": "intent"|"promise"|"assess"|"revise"|"release",
                          "content": str, "parentId"?: str, "refersTo"?: str}
  {"op": "postScenario", "content": str}

Environment used:
  SPACEBASE_SPACE_ID         the bound space id (required)
  SPACEBASE_ITP_ENDPOINT     the ITP endpoint we authenticated against (required)
  SPACEBASE_AGENT_HANDLE     handle for the session (defaults to "medi-agent")
  SPACEBASE_WORKSPACE        path to the directory holding .intent-space (defaults to cwd)
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, Optional


def _load_sdk() -> None:
    candidates = [
        Path.home() / ".claude" / "skills" / "intent-space-agent-pack" / "sdk",
        Path.home() / ".codex" / "skills" / "intent-space-agent-pack" / "sdk",
        Path("marketplace") / "plugins" / "intent-space-agent-pack" / "sdk",
    ]
    for candidate in candidates:
        if candidate.exists():
            sys.path.insert(0, str(candidate))
            return
    raise RuntimeError(
        "intent-space-agent-pack SDK not found in any expected location"
    )


_load_sdk()

import time as _time  # noqa: E402

from http_space_tools import HttpSpaceToolSession  # noqa: E402
from intent_space_sdk import LocalState  # noqa: E402


# Race fix: when several agent loops fire bridge subprocesses in parallel,
# two of them can collide on .intent-space/state/known-stations.json (one
# writing while the other reads, producing an empty or partial file). The
# SDK's load_known_stations does a bare json.loads with no retry, so the
# loser crashes. We monkey-patch to retry once on JSONDecodeError and then
# fall back to an empty list, which the SDK treats the same as a missing
# file. The retry succeeds because the writer holds the write briefly.
_original_load_known_stations = LocalState.load_known_stations


def _safe_load_known_stations(self):
    try:
        return _original_load_known_stations(self)
    except json.JSONDecodeError:
        _time.sleep(0.1)
        try:
            return _original_load_known_stations(self)
        except json.JSONDecodeError:
            return []


LocalState.load_known_stations = _safe_load_known_stations


def _env(name: str, *, required: bool = True, default: Optional[str] = None) -> Optional[str]:
    value = os.environ.get(name, default)
    if required and (value is None or value == ""):
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def _make_session() -> HttpSpaceToolSession:
    workspace = Path(_env("SPACEBASE_WORKSPACE", required=False, default=str(Path.cwd())))
    endpoint = _env("SPACEBASE_ITP_ENDPOINT")
    handle = _env("SPACEBASE_AGENT_HANDLE", required=False, default="medi-agent")
    session = HttpSpaceToolSession(
        endpoint=endpoint,
        workspace=workspace,
        agent_name=handle,
    )
    session.connect()
    return session


def op_scan(cmd: Dict[str, Any]) -> Dict[str, Any]:
    session = _make_session()
    space_id = cmd.get("spaceId") or _env("SPACEBASE_SPACE_ID")
    since = int(cmd.get("since") or 0)
    result = session.client.scan_from(space_id, since=since, persist_cursor=False)
    return {
        "spaceId": result.get("spaceId", space_id),
        "latestSeq": result.get("latestSeq", 0),
        "messages": result.get("messages", []),
    }


def op_post(cmd: Dict[str, Any]) -> Dict[str, Any]:
    session = _make_session()
    stage = cmd.get("stage")
    content = cmd.get("content")
    if not isinstance(stage, str) or not isinstance(content, str):
        raise ValueError("post requires 'stage' (string) and 'content' (string)")
    # Parent precedence: explicit parentId from the LLM decision, then the
    # current spaceId the agent is running in (interior sub-space for the
    # mediation), then the bound space from env as a final safety net.
    parent_id = (
        cmd.get("parentId")
        or cmd.get("spaceId")
        or _env("SPACEBASE_SPACE_ID")
    )
    refers_to = cmd.get("refersTo")

    if stage == "intent":
        message = session.intent(content=content, parent_id=parent_id)
    elif stage == "promise":
        if not isinstance(refers_to, str) or not refers_to:
            raise ValueError("stage 'promise' requires refersTo (intentId being promised against)")
        message = session.promise(parent_id=parent_id, intent_id=refers_to, content=content)
    elif stage == "assess":
        if not isinstance(refers_to, str) or not refers_to:
            raise ValueError("stage 'assess' requires refersTo (promiseId being judged)")
        message = session.assess(parent_id=parent_id, promise_id=refers_to, assessment=content)
    elif stage == "revise":
        if not isinstance(refers_to, str) or not refers_to:
            raise ValueError("stage 'revise' requires refersTo (id of the post being revised)")
        message = session.intent(
            content=content,
            parent_id=parent_id,
            payload={"stage": "revise", "refersTo": refers_to},
        )
    elif stage == "release":
        payload: Dict[str, Any] = {"stage": "release"}
        if isinstance(refers_to, str) and refers_to:
            payload["refersTo"] = refers_to
        message = session.intent(content=content, parent_id=parent_id, payload=payload)
    else:
        raise ValueError(f"unknown stage: {stage}")

    session.send(message)

    return {
        "id": message.get("intentId") or message.get("promiseId"),
        "intentId": message.get("intentId"),
        "promiseId": message.get("promiseId"),
        "type": message.get("type"),
        "parentId": message.get("parentId"),
        "senderId": message.get("senderId"),
        "timestamp": message.get("timestamp"),
        "payload": message.get("payload"),
    }


def op_post_scenario(cmd: Dict[str, Any]) -> Dict[str, Any]:
    return op_post({
        "stage": "intent",
        "content": cmd.get("content"),
        "parentId": _env("SPACEBASE_SPACE_ID"),
    })


OPS = {
    "scan": op_scan,
    "post": op_post,
    "postScenario": op_post_scenario,
}


def main() -> None:
    raw = sys.stdin.read()
    try:
        command = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        sys.stdout.write(json.dumps({"ok": False, "error": f"invalid JSON on stdin: {exc}"}))
        sys.exit(2)

    op = command.get("op")
    handler = OPS.get(op)
    if handler is None:
        sys.stdout.write(json.dumps({"ok": False, "error": f"unknown op: {op!r}"}))
        sys.exit(2)

    try:
        result = handler(command)
        sys.stdout.write(json.dumps({"ok": True, "result": result}, default=str))
    except Exception as exc:
        sys.stdout.write(json.dumps({
            "ok": False,
            "error": str(exc),
            "errorType": type(exc).__name__,
            "trace": traceback.format_exc(),
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
