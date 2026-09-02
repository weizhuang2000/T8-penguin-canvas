"""Codex CLI JSONL runner executed in an isolated per-job container."""
from __future__ import annotations

import json
import logging
import subprocess
import threading
from pathlib import Path
from typing import Callable

from backend.config import get_runtime_config
from backend.runner.docker import (
    _build_docker_run_cmd,
    _start_docker_watchdog,
    container_name_for,
)

log = logging.getLogger("backend.runner.codex")


def stream_codex(
    prompt: str,
    project_root: Path,
    on_event: Callable[[dict], None],
    *,
    cancel_event=None,
    proc_holder=None,
    job_id=None,
    session_id: str | None = None,
) -> dict:
    """Run Codex and translate its JSONL stream to ppt-web runner events."""
    cmd, _mount_path, _host_prefix = _build_docker_run_cmd(
        ["-p", prompt], project_root, job_id,
    )
    image_index = len(cmd) - 1
    if session_id:
        cmd[image_index:image_index] = [
            "-e", "RESUME_SESSION=1",
            "-e", f"RESUME_SESSION_ID={session_id}",
        ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    if proc_holder is not None:
        proc_holder.append(proc)

    container_name = (
        container_name_for(job_id)
        if job_id
        else cmd[cmd.index("--name") + 1]
    )
    watchdog: threading.Timer | None = None
    if cancel_event is not None:
        watchdog = _start_docker_watchdog(
            cancel_event,
            get_runtime_config().docker.timeout_s,
            container_name,
        )

    final: dict = {}
    thread_id: str | None = session_id
    assistant_text = ""
    cancelled = False
    try:
        for line in proc.stdout or []:
            if cancel_event is not None and cancel_event.is_set():
                cancelled = True
                break
            try:
                event = json.loads(line)
            except (TypeError, json.JSONDecodeError):
                continue

            kind = str(event.get("type") or "")
            if kind == "thread.started":
                thread = event.get("thread")
                thread_id = str(
                    event.get("thread_id")
                    or (thread.get("id") if isinstance(thread, dict) else "")
                    or thread_id
                    or ""
                ) or None
            elif kind == "item.completed" and isinstance(event.get("item"), dict):
                item = event["item"]
                if item.get("type") in ("agent_message", "message"):
                    chunk = str(item.get("text") or item.get("content") or "")
                    if chunk:
                        assistant_text += chunk
                        on_event({"kind": "agent_text", "text": assistant_text})
            elif kind == "turn.completed":
                final = event
            elif kind in ("turn.failed", "error"):
                message = event.get("message") or event.get("error") or "Codex turn failed"
                on_event({"kind": "error", "message": str(message)})

            on_event({"kind": "codex_event", "type": kind, "event": event})
    finally:
        if cancelled and proc.poll() is None:
            proc.terminate()
        proc.wait()
        if watchdog is not None:
            watchdog.cancel()

    stderr = (proc.stderr.read() if proc.stderr else "").strip()
    if stderr:
        log.warning(
            "Codex runner stderr for job %s: %s",
            job_id or "?",
            stderr[-2000:],
        )
        if proc.returncode not in (0, None):
            on_event({"kind": "error", "message": stderr[-2000:]})
    if proc.returncode not in (0, None) and not cancelled:
        raise RuntimeError(stderr or f"Codex CLI exited {proc.returncode}")

    return {
        "session_id": thread_id or final.get("thread_id"),
        "_last_assistant_text": assistant_text,
        "_cancelled": cancelled,
        "total_cost_usd": None,
    }
