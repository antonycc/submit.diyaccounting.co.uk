#!/usr/bin/env bash
set -euo pipefail

# 1️⃣ If the host has an SSH agent socket, mount it and export it
if [ -n "${SSH_AUTH_SOCK_HOST:-}" ] && [ -S "$SSH_AUTH_SOCK_HOST" ]; then
  echo "🔑 Forwarding SSH agent..."
  export SSH_AUTH_SOCK=/ssh-agent
  mkdir -p /ssh-agent-dir
  ln -sf "$SSH_AUTH_SOCK_HOST" /ssh-agent
fi

# 2️⃣ Copy codex credentials from host mount (if present)
if [ -d "/host_codex" ]; then
  echo "📄 Injecting Codex credentials..."
  mkdir -p /root/.codex
  cp /host_codex/*.json /root/.codex/ 2>/dev/null || true
  chmod 600 /root/.codex/*
fi

# 3. Sync your local workspace into /app (honouring .gitignore)
if [ -d "/host_workdir" ]; then
  echo "📂 Syncing workspace into /app..."
  rsync -a --delete \
    --exclude-from=/host_workdir/.gitignore \
    /host_workdir/ /app/
fi

# 4. Copy ssh credentials from host mount (if present)
if [ -d "/host_ssh" ]; then
  echo "📄 Injecting Certificates..."
  mkdir -p /root/.ssh
  cp /host_ssh/id_antony_polycode_mbp_2025 /root/.ssh/. 2>/dev/null || true
  cp /host_ssh/id_antony_polycode_mbp_2025.pub /root/.ssh/. 2>/dev/null || true
  chmod 600 /root/.ssh/id_antony_polycode_mbp_2025
  chmod 644 /root/.ssh/id_antony_polycode_mbp_2025.pub
  eval $(ssh-agent -s)
  ssh-add -D
  ssh-add /root/.ssh/id_antony_polycode_mbp_2025
  ssh -o StrictHostKeyChecking=no -T git@github.com || true
  git config --global user.email "codex@docker"
  git config --global user.name "Codex in Docker"
fi

# git push --set-upstream origin codex-in-docker
# The authenticity of host 'github.com (20.26.156.215)' can't be established.
# ED25519 key fingerprint is SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU.
# This key is not known by any other names.
# Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
# Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.
# git@github.com: Permission denied (publickey).
# fatal: Could not read from remote repository.
# Please make sure you have the correct access rights
# and the repository exists.

# 4️⃣ Start in /app with environment ready
exec "$@"
