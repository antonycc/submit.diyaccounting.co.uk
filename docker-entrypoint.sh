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
    
    # Check if Java is available for DynamoDB Local
    if ! command -v java >/dev/null 2>&1; then
      echo "WARNING: Java not found. DynamoDB Local will not be available."
      echo "The application will attempt to use DYNAMODB_ENDPOINT if configured."
    fi
    
    # Create data directory for DynamoDB Local persistence if it doesn't exist
    mkdir -p /data/dynamodb
    
    # Start the Node.js monolith application
    # The monolith.js script will handle starting DynamoDB Local if needed
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
