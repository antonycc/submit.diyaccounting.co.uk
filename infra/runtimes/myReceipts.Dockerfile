# Use the base image built in the previous job step
ARG BASE_IMAGE_TAG=submit-base:latest
FROM ${BASE_IMAGE_TAG}

# Lambda-specific environment variables
ENV DIY_SUBMIT_HOME_URL="The default value from the Dockerfile is intended to be overridden."
ENV DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX="The default value from the Dockerfile is intended to be overridden."

# The base image already contains node, deps and app code
# Set the specific handler for this Lambda
CMD ["app/functions/myReceipts/myReceipts.httpGet"]
