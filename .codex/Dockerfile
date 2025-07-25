# syntax=docker/dockerfile:1

FROM node:22-alpine

# install git, ssh client, rsync, bash
RUN apk add --no-cache \
    curl \
    git \
    openssh-client \
    bash \
    rsync \
    vim \
    wget

WORKDIR /app

# copy package manifests & install deps (including openai/codex lib)
COPY package.json package-lock.json* ./
RUN npm install --no-audit

# copy our custom entrypoint
COPY .codex/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /root/.codex/
COPY .codex/docker-codex-config.toml /root/.codex/config.toml

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]
