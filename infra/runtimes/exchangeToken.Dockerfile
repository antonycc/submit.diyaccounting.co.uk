FROM public.ecr.aws/lambda/nodejs:22

# exchangeToken
ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_ID="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN="From Dockerfile"
ENV DIY_SUBMIT_HOME_URL="From Dockerfile"
ENV DIY_SUBMIT_TEST_ACCESS_TOKEN="From Dockerfile"

# Log build context and paths for debugging
RUN echo "[DEBUG_LOG] exchangeToken.Dockerfile: Build context is $(pwd)"
RUN echo "[DEBUG_LOG] exchangeToken.Dockerfile: Listing root directory:" && ls -la /
RUN echo "[DEBUG_LOG] exchangeToken.Dockerfile: Listing current directory:" && ls -la .

COPY package.json package-lock.json ./
RUN echo "[DEBUG_LOG] exchangeToken.Dockerfile: Installing npm dependencies" && npm install --production
COPY app/ app/
RUN echo "[DEBUG_LOG] exchangeToken.Dockerfile: Final directory structure:" && ls -la .
