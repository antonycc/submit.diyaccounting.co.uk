#!/bin/sh
# docker-entrypoint.sh
# Entry point script for Docker container supporting both Lambda and monolith modes

set -e

# Determine the application mode from environment variable
APP_MODE="${APP_MODE:-lambda}"

echo "Docker entrypoint starting with APP_MODE=${APP_MODE}"

case "${APP_MODE}" in
  lambda)
    echo "Starting in Lambda mode..."
    # Use the AWS Lambda RIC (Runtime Interface Client) to handle Lambda invocations
    # The Lambda base image provides this at /usr/local/bin/aws-lambda-ric
    exec /usr/local/bin/aws-lambda-ric node --experimental-specifier-resolution=node app/index.js
    ;;
    
  monolith)
    echo "Starting in monolith mode..."
    # Start the Node.js monolith application
    # Uses AWS DynamoDB (not local) for all data persistence
    exec node app/bin/monolith.js
    ;;
    
  test)
    echo "Starting in test mode (using dynalite)..."
    # For testing, we use dynalite instead of DynamoDB Local
    # The test suite will manage dynalite startup
    exec node app/bin/server.js
    ;;
    
  *)
    echo "ERROR: Invalid APP_MODE='${APP_MODE}'. Must be 'lambda', 'monolith', or 'test'."
    exit 1
    ;;
esac
