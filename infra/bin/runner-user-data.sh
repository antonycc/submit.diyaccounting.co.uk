#!/bin/bash -xe
#
# Expects env set by user-data wrapper:
#   GITHUB_REPO                e.g. antonycc/submit.diyaccounting.co.uk
#   GITHUB_PAT_SECRET_ARN      arn:aws:secretsmanager:eu-west-2:...:secret:...
#   RUNNER_LABELS              e.g. submit,ec2,highcpu
#   RUNNER_VERSION             e.g. 2.321.0
#   IDLE_MAX (optional)        seconds before auto-shutdown when idle (default 3600)

IDLE_MAX="${IDLE_MAX:-3600}"

dnf update -y || yum update -y
dnf install -y tar gzip jq git curl awscli || yum install -y tar gzip jq git curl awscli

# Docker + toolchain
dnf install -y docker || yum install -y docker
systemctl enable --now docker

# Node 22 + Corretto 21
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs java-21-amazon-corretto || yum install -y nodejs java-21-amazon-corretto

# Runner user
useradd -m -s /bin/bash actions || true
usermod -aG docker actions || true
mkdir -p /opt/actions-runner && chown actions:actions /opt/actions-runner
cd /opt/actions-runner

# Download runner
: "${RUNNER_VERSION:?RUNNER_VERSION required}"
su - actions -c "curl -L -o actions-runner.tar.gz https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
su - actions -c "tar xzf actions-runner.tar.gz"

# Get PAT and mint registration token
: "${GITHUB_PAT_SECRET_ARN:?GITHUB_PAT_SECRET_ARN required}"
: "${GITHUB_REPO:?GITHUB_REPO required}"
PAT="$(aws secretsmanager get-secret-value --secret-id "$GITHUB_PAT_SECRET_ARN" --query SecretString --output text)"
REG_TOKEN="$(curl -sX POST -H "Authorization: token ${PAT}" "https://api.github.com/repos/${GITHUB_REPO}/actions/runners/registration-token" | jq -r .token)"

# Configure runner (sticky; auto-shutdown on idle)
: "${RUNNER_LABELS:=submit,ec2}"
su - actions -c "./config.sh --url https://github.com/${GITHUB_REPO} --token ${REG_TOKEN} --labels ${RUNNER_LABELS} --name $(hostname) --work _work --unattended"

# Install and start service
./svc.sh install actions
systemctl enable actions
systemctl start actions

# Idle reaper
cat >/usr/local/bin/runner-idle-reaper.sh <<'EOF'
#!/bin/bash
IDLE_MAX="${IDLE_MAX:-3600}"
LAST=$(date +%s)
while sleep 30; do
  if [ -z "$(ls -A /opt/actions-runner/_work 2>/dev/null)" ]; then
    NOW=$(date +%s)
  else
    LAST=$(date +%s)
    NOW="$LAST"
  fi
  if [ $(( NOW - LAST )) -gt "$IDLE_MAX" ]; then
    shutdown -h now
  fi
done
EOF
chmod +x /usr/local/bin/runner-idle-reaper.sh
nohup env IDLE_MAX="${IDLE_MAX}" /usr/local/bin/runner-idle-reaper.sh >/var/log/runner-idle-reaper.log 2>&1 &
