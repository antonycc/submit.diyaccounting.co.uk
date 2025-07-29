FROM public.ecr.aws/lambda/nodejs:22

# exchangeToken
ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_ID="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN="From Dockerfile"
ENV DIY_SUBMIT_HOME_URL="From Dockerfile"
ENV DIY_SUBMIT_TEST_ACCESS_TOKEN="From Dockerfile"

COPY ../../package.json ../../package-lock.json ./
RUN npm install --production
COPY ../../src/ src/
