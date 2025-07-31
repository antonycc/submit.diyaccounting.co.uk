FROM public.ecr.aws/lambda/nodejs:22

# exchangeToken
ENV DIY_SUBMIT_HMRC_BASE_URI="The default value from the Dockerfile is intended to be overridden."
ENV DIY_SUBMIT_HMRC_CLIENT_ID="The default value from the Dockerfile is intended to be overridden."
ENV DIY_SUBMIT_HMRC_CLIENT_SECRET_ARN="The default value from the Dockerfile is intended to be overridden."
ENV DIY_SUBMIT_HOME_URL="The default value from the Dockerfile is intended to be overridden."
ENV DIY_SUBMIT_TEST_ACCESS_TOKEN="The default value from the Dockerfile is intended to be overridden."

# Log build context and paths for debugging
RUN echo "exchangeToken.Dockerfile: Build context is $(pwd)"
RUN echo "exchangeToken.Dockerfile: Listing root directory:" && ls -la /
RUN echo "exchangeToken.Dockerfile: Listing current directory:" && ls -la .

COPY package.json package-lock.json ./
RUN echo "exchangeToken.Dockerfile: Installing npm dependencies" && npm install --production
COPY app/ app/
RUN echo "exchangeToken.Dockerfile: Final directory structure:" && ls -la .
