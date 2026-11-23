#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .private-states/ollama-runtime/bin .private-states/ollama-runtime/lib/ollama
chmod 700 .private-states/ollama-runtime
if [[ ! -x .private-states/ollama-runtime/bin/ollama ]]; then
  docker compose --profile local-ai up -d ollama
  docker compose exec -T ollama cat /bin/ollama > .private-states/ollama-runtime/bin/ollama
  chmod +x .private-states/ollama-runtime/bin/ollama
  docker compose exec -T ollama sh -c 'tar -C /usr/lib/ollama --exclude=./cuda_v13 --exclude=./mlx_cuda_v13 --exclude=./include -cf - .' | tar -xf - -C .private-states/ollama-runtime/lib/ollama
fi
# Official image binaries run as this user and use the existing NVIDIA driver; no sudo or driver changes.
export OLLAMA_HOST=127.0.0.1:11435
export OLLAMA_MODELS="$PWD/.private-states/ollama-models"
exec .private-states/ollama-runtime/bin/ollama serve
