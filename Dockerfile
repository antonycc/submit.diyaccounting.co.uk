# Optimized Dockerfile for AWS Lambda with ARM64 architecture
# Uses multi-stage pattern to ensure clean, minimal image
# Platform is specified during build with --platform linux/arm64
FROM public.ecr.aws/lambda/nodejs:22 AS builder

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY web/public/submit.catalogue.toml web/public/submit.catalogue.toml

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts

# Final stage
FROM public.ecr.aws/lambda/nodejs:22

# Copy dependencies from builder
COPY --from=builder /var/task/node_modules ./node_modules
COPY --from=builder /var/task/package.json ./package.json
COPY --from=builder /var/task/web/public/submit.catalogue.toml ./web/public/submit.catalogue.toml

# Copy application code
COPY app/lib app/lib
COPY app/functions app/functions
COPY app/data app/data
COPY app/services app/services

# Lambda will use CMD override from CDK EcrImageCodeProps
