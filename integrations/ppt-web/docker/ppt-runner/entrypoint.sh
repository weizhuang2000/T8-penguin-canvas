#!/bin/bash
# Execute one PPT job with Codex. The prompt is passed through stdin so it is
# not exposed in the process list.
set -euo pipefail

echo "[ppt-runner] job=${JOB_ID:-?} resume=${RESUME_SESSION:-0} ts=$(date -u +%FT%TZ)" >&2

if [ -z "${PROMPT:-}" ]; then
  echo "[ppt-runner] ERROR: PROMPT env is required" >&2
  exit 2
fi

FULL_PROMPT="${PROMPT}"
if [ -n "${EXTRA_PROMPT:-}" ]; then
  FULL_PROMPT="${PROMPT}

${EXTRA_PROMPT}"
fi

# The job already runs inside a short-lived Docker container with only the
# current user's PPT workspace mounted. Do not start Codex's Linux sandbox
# inside that container: its bwrap namespace setup is blocked on hardened
# hosts and the nested sandbox is redundant here.
ARGS=(exec --json --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check)
CODEX_MODEL="${T8_PPT_CODEX_MODEL:-}"
if [ -n "${T8_PPT_CODEX_BASE_URL:-}" ]; then
  # Use the selected T8 LLM independent configuration through a private
  # Codex model provider. The API key is passed only via env_key.
  CODEX_MODEL="${CODEX_MODEL:-gpt-4.1}"
  ARGS+=(-c 'model_provider="t8_ppt_llm"' \
    -c 'model_providers.t8_ppt_llm.name="T8 LLM Config"' \
    -c "model_providers.t8_ppt_llm.base_url=\"${T8_PPT_CODEX_BASE_URL%/}/v1\"" \
    -c 'model_providers.t8_ppt_llm.wire_api="responses"' \
    -c 'model_providers.t8_ppt_llm.env_key="CODEX_API_KEY"' \
    -c 'model_providers.t8_ppt_llm.requires_openai_auth=false' \
    -c 'disable_response_storage=true')
fi
if [ -n "${CODEX_MODEL}" ]; then
  # Keep exactly one --model argument. Adding it in both the provider block
  # and here makes Codex reject the command before a turn can start.
  ARGS+=(--model "${CODEX_MODEL}")
fi
if [ "${RESUME_SESSION:-0}" = "1" ] && [ -n "${RESUME_SESSION_ID:-}" ]; then
  ARGS+=(resume "${RESUME_SESSION_ID}")
fi

cd /opt/ppt-master
echo "[ppt-runner] exec: codex ${ARGS[*]} -" >&2
exec codex "${ARGS[@]}" - <<< "${FULL_PROMPT}"
