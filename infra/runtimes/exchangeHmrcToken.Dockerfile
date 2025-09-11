# Use the base image built in the previous job step
ARG BASE_IMAGE_TAG=submit-base:latest
FROM ${BASE_IMAGE_TAG}

# Lambda-specific environment variables
ENV DIY_SUBMIT_HMRC_BASE_URI=""
ENV DIY_SUBMIT_HMRC_CLIENT_ID=""
ENV DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN=""
ENV DIY_SUBMIT_HOME_URL=""
ENV DIY_SUBMIT_TEST_ACCESS_TOKEN=""

# No need to copy package.json or run npm install - it's already in the base image!
# The app/ directory is also already copied in the base image

# Set the specific handler for this Lambda
CMD ["app/functions/exchangeToken/exchangeToken.exchangeTokenHttpPostHmrc"]
