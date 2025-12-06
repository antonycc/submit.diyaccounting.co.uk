# Default Dockerfile used for layer caching for CDK builds
# Supports both Lambda and monolith (App Runner) deployment modes
FROM public.ecr.aws/lambda/nodejs:22

# Install Java for DynamoDB Local (required for monolith mode)
RUN yum install -y java-17-amazon-corretto wget unzip && yum clean all

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

# Download DynamoDB Local for persistence in monolith mode
RUN mkdir -p /opt/dynamodb-local && \
    cd /opt/dynamodb-local && \
    wget -q https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz && \
    tar -xzf dynamodb_local_latest.tar.gz && \
    rm dynamodb_local_latest.tar.gz

# Create data directory for DynamoDB Local persistence
RUN mkdir -p /data/dynamodb

# Copy and make executable the entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose port 3000 for monolith mode (App Runner)
EXPOSE 3000

# Set default APP_MODE to lambda (can be overridden)
ENV APP_MODE=lambda

# Use the entrypoint script to determine runtime mode
CMD ["./docker-entrypoint.sh"]
