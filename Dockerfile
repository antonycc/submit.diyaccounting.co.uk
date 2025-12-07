# Default Dockerfile used for layer caching for CDK builds
# Supports both Lambda and monolith (App Runner) deployment modes
FROM public.ecr.aws/lambda/nodejs:22

WORKDIR /var/task

# Copy package files and install dependencies
COPY package.json package-lock.json product-catalogue.toml ./
RUN npm ci --omit=dev

# Copy application code
COPY app/lib app/lib
COPY app/functions app/functions
COPY app/data app/data
COPY app/services app/services
COPY app/bin app/bin
COPY app/auth app/auth
COPY app/index.js app/index.js

# Copy static web files (for monolith mode)
COPY web/public web/public

# Copy and make executable the entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose port 3000 for monolith mode (App Runner)
EXPOSE 3000

# Set default APP_MODE to lambda (can be overridden)
ENV APP_MODE=lambda

# Use the entrypoint script to determine runtime mode
CMD ["./docker-entrypoint.sh"]
