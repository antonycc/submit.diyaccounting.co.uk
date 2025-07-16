# syntax=docker/dockerfile:1

FROM node:20-alpine

# install git, ssh client, rsync, bash
RUN apk add --no-cache \
    git \
    openssh-client \
    bash \
    rsync

WORKDIR /app

# copy package manifests & install deps (including openai/codex lib)
COPY package.json package-lock.json* ./
RUN npm install --no-audit

# copy our custom entrypoint
COPY .codex/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bash"]
