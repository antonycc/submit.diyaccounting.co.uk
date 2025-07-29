FROM public.ecr.aws/lambda/nodejs:22

# TODO: Create separate Dockerfiles for each function and move to ./infra/runtimes

# authURL
ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_ID="From Dockerfile"
ENV DIY_SUBMIT_HOME_URL="From Dockerfile"

# exchangeToken
#ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
#ENV DIY_SUBMIT_HMRC_CLIENT_ID="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN="From Dockerfile"
#ENV DIY_SUBMIT_HOME_URL="From Dockerfile"
ENV DIY_SUBMIT_TEST_ACCESS_TOKEN="From Dockerfile"

# submitVat
#ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
ENV DIY_SUBMIT_TEST_RECEIPTS_BUCKET="From Dockerfile"

# logReceipt
ENV DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX="From Dockerfile"

COPY ../package.json package-lock.json ./
RUN npm install --production
COPY ../src src/
