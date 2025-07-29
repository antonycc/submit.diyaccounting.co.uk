# DIY Accounting Codex Sandbox & External MCP Servers

This README explains how to build and run the Codex‐enabled development container (via `./codew`) and how to extend it to provision and access “external MCP” servers (e.g. GitHub Codespaces, self‑hosted runners, cloud VMs, Kubernetes pods).

---

## 📦 Project Layout

```

.
├── .codex/
│   ├── Dockerfile
│   └── docker-entrypoint.sh
├── codew
├── package.json
├── app/
└── scripts/
├── mcp-codespace.sh
├── mcp-runner.sh
├── mcp-terraform.sh
└── mcp-tunnel.sh

````

- **`.codex/Dockerfile`** & **`.codex/docker-entrypoint.sh`** define our container.
- **`codew`** is the single runner script (must be `chmod +x codew`).
- **`scripts/`** holds helper scripts for external MCP workflows.

---

## ⚙️ 1. Build & Run the Container

From your repo root:

```bash
# 1) Build (only needs doing when Dockerfile or deps change)
docker build -f .codex/Dockerfile -t diyacct-codex .

# 2) Launch interactive shell
./codew
````

`codew` is:

```bash
#!/usr/bin/env bash
set -euo pipefail

docker build -f .codex/Dockerfile -t diyacct-codex .
docker run -it \
  --init \
  -e SSH_AUTH_SOCK_HOST="$SSH_AUTH_SOCK" \
  -v "$SSH_AUTH_SOCK":"$SSH_AUTH_SOCK_HOST":ro \
  -v "${HOME}/.codex":/host_codex:ro \
  -v "$(pwd)":/host_workdir:ro \
  diyacct-codex
```

Inside the container you’ll find:

* `/app` → your workspace (rsynced, excludes `.gitignore`)
* `node_modules` → installed dependencies (OpenAI Codex included)
* SSH agent forwarded → `git push`/`git pull` works
* Codex creds in `~/.codex/auth.json`

---

## 🚀 4. Strategy & Tech Stack for “External MCP Servers”

Below are *actionable*, in‑container examples for each approach. Helper scripts go in `./scripts/` to streamline usage.

### A) Credential & Connectivity Injection

*No extra steps*—already handled by entrypoint.
To add AWS or Kubernetes creds, mount your host folders:

```bash
./codew -v ~/.aws:/root/.aws:ro -v ~/.kube:/root/.kube:ro
```

---

### B) Dynamic Compute Provisioning

#### 1. GitHub Codespaces

Inside container, use the GitHub CLI:

```bash
# List your existing codespaces
gh codespace list

# Create a new codespace for this repo
gh codespace create --repo yourorg/yourrepo --branch main

# SSH into it
gh codespace ssh --codespace <NAME>
```

**Helper script**: `scripts/mcp-codespace.sh`

```bash
#!/usr/bin/env bash
# Usage: ./scripts/mcp-codespace.sh yourorg/yourrepo main
gh codespace create --repo "$1" --branch "${2:-main}"
gh codespace ssh --codespace $(gh codespace list --json name --jq '.[0].name')
```

---

#### 2. Self‑Hosted Runner

Register & start a GitHub Actions runner:

```bash
# Download and extract runner
curl -O -L https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-linux-x64-2.x.x.tar.gz
tar xzf ./actions-runner-linux-x64-2.x.x.tar.gz
cd actions-runner

# Configure (requires RUNNER_TOKEN env var)
./config.sh --url https://github.com/yourorg/yourrepo --token "$RUNNER_TOKEN"

# Launch
./run.sh
```

**Helper script**: `scripts/mcp-runner.sh`

```bash
#!/usr/bin/env bash
# Usage: ./scripts/mcp-runner.sh YOUR_RUNNER_TOKEN
cd actions-runner
./config.sh --url https://github.com/yourorg/yourrepo --token "$1"
./run.sh
```

---

#### 3. Cloud VMs via Terraform

Example Terraform (`iac/main.tf`):

```hcl
provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "mcp" {
  ami           = "ami-0abcdef1234567890"
  instance_type = "t3.micro"
  tags = { Name = "mcp-server" }
}
```

Commands inside container:

```bash
cd iac
terraform init
terraform apply -auto-approve
```

**Helper script**: `scripts/mcp-terraform.sh`

```bash
#!/usr/bin/env bash
cd iac
terraform init
terraform apply -auto-approve
```

---

### C) Kubernetes Ephemeral Pods

Launch a scratch pod:

```bash
kubectl run mcp-pod --image node:22-alpine --restart=Never --command -- sleep infinity
kubectl exec -it mcp-pod -- bash
```

**Extension**: Write a Node.js CLI using `@kubernetes/client-node` for programmatic control—place in `app/lib/mcp.js`.

---

### D) Remote Access & Port Forwarding

Expose local ports via ngrok:

```bash
ngrok http 3000
```

**Helper script**: `scripts/mcp-tunnel.sh`

```bash
#!/usr/bin/env bash
# Usage: ./scripts/mcp-tunnel.sh 3000
ngrok http "${1:-3000}"
```

---

## 🔧 Putting It All Together

1. **Build & enter**: `./codew`
2. **Manage Codespaces**: `./scripts/mcp-codespace.sh yourorg/yourrepo main`
3. **Run a self-hosted runner**: `./scripts/mcp-runner.sh $RUNNER_TOKEN`
4. **Provision cloud VM**: `./scripts/mcp-terraform.sh`
5. **Spawn k8s pod**: use `kubectl` or extend with `app/lib/mcp.js`
6. **Open tunnel**: `./scripts/mcp-tunnel.sh 3000`

Each helper script can be extended with flags or prompts to make your sandbox operations even smoother. Enjoy your instantly mountable, Codex‑powered developer playground!
