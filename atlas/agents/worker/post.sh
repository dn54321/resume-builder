#!/usr/bin/env bash
# post.sh — Worker agent post-stop script.
echo "[post.sh] Worker agent stopping: ${ATLAS_AGENT_NAME}"
echo "[post.sh] Exit code: ${ATLAS_AGENT_EXIT_CODE:-unknown}"
echo "[post.sh] Log: ${ATLAS_AGENT_LOG}"
echo "[post.sh] Done."
