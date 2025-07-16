# syntax=docker/dockerfile:1

FROM node:20-alpine

# 1) Install git, ssh, bash and rsync
RUN apk add --no-cache \
      git \
      openssh-client \
      bash \
      rsync

WORKDIR /app

# 2) Copy only package files and install deps
#    (we'll sync your workspace code at runtime)
COPY package.json package-lock.json* ./
RUN npm install --no‑audit

# 3) Copy the entrypoint helper
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 4) Switch to our entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]
# 5) Default to bash
CMD ["bash"]
