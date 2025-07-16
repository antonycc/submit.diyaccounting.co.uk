#!/usr/bin/env bash
set -euo pipefail

# 1) Inject host SSH keys, if you mounted them
if [ -d "/host_ssh" ]; then
  echo "🗝️  Copying SSH keys from host..."
  mkdir -p /root/.ssh
  cp /host_ssh/id_rsa* /root/.ssh/ 2>/dev/null || true
  cp /host_ssh/known_hosts /root/.ssh/ 2>/dev/null || true
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/id_rsa*
  # disable StrictHostKeyChecking to simplify first‑time pushes
  printf 'Host *\n\tStrictHostKeyChecking no\n' > /root/.ssh/config
fi

# 2) Sync your workspace files into /app, excluding .gitignore patterns
if [ -d "/host_workdir" ]; then
  echo "📁 Syncing workspace into /app (excludes .gitignore)..."
  rsync -a --delete \
    --exclude-from=/host_workdir/.gitignore \
    /host_workdir/ /app/
fi

# 3) Finally, hand control over to whatever command was passed (usually 'bash')
exec "$@"
