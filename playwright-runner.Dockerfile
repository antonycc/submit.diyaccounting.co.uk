# ./playwright-runner.Dockerfile
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=development \
    CI=true

# Base tools roughly matching what you expect on a runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git unzip python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

# Node 22.x
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /work

# Install that version and preinstall browsers + OS deps once, then remove pkg
RUN npm -g config set audit false \
 && npm -g config set fund false \
 && npm init -y \
 && npm i -D @playwright/test@1.55.1 \
 && npx playwright install chromium --with-deps \
 && npm rm -D @playwright/test

# You’ll mount your repo and run whatever you need
CMD ["bash"]
