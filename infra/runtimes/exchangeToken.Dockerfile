FROM public.ecr.aws/lambda/nodejs:22

# exchangeToken
ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_ID="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN="From Dockerfile"
ENV DIY_SUBMIT_HOME_URL="From Dockerfile"
ENV DIY_SUBMIT_TEST_ACCESS_TOKEN="From Dockerfile"

# Log build context and paths for debugging
RUN echo "exchangeToken.Dockerfile: Build context is $(pwd)"
RUN echo "exchangeToken.Dockerfile: Listing root directory:" && ls -la /
RUN echo "exchangeToken.Dockerfile: Listing current directory:" && ls -la .

COPY package.json package-lock.json ./
RUN echo "exchangeToken.Dockerfile: Installing npm dependencies" && npm install --production
COPY app/ app/
RUN echo "exchangeToken.Dockerfile: Final directory structure:" && ls -la .
