#!/bin/bash
set -euo pipefail

IMAGE="${DOCKER_RUNNER_IMAGE:-ppt-runner:latest}"
NETWORK="${DOCKER_RUNNER_NETWORK:-ppt-isolated}"

cd "$(dirname "$0")/../.."
echo "==> Building ${IMAGE} (context: $(pwd))"
docker build -f docker/ppt-runner/Dockerfile -t "${IMAGE}" \
  --build-arg NODE_IMAGE="${DOCKER_NODE_IMAGE:-node:22-bookworm-slim}" \
  --build-arg NPM_REGISTRY="${DOCKER_NPM_REGISTRY:-https://registry.npmmirror.com}" \
  --build-arg PIP_INDEX_URL="${DOCKER_PIP_INDEX_URL:-https://mirrors.aliyun.com/pypi/simple/}" \
  --build-arg PPT_MASTER_ARCHIVE="${PPT_MASTER_ARCHIVE:-https://codeload.github.com/hugohe3/ppt-master/tar.gz}" \
  --build-arg PPT_MASTER_REF="${PPT_MASTER_REF:-main}" \
  .

echo "==> Ensuring ${NETWORK} network exists"
if ! docker network inspect "${NETWORK}" >/dev/null 2>&1; then
  docker network create --driver bridge "${NETWORK}"
fi

echo "==> Built ${IMAGE}"
echo "    Verify: docker run --rm --entrypoint codex ${IMAGE} --version"
