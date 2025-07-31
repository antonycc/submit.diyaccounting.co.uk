FROM public.ecr.aws/lambda/nodejs:22

ENV DIY_SUBMIT_HMRC_BASE_URI="The default value from the Dockerfile is intended to be overridden."
ENV DIY_SUBMIT_HMRC_CLIENT_ID="The default value from the Dockerfile is intended to be overridden."
ENV DIY_SUBMIT_HOME_URL="The default value from the Dockerfile is intended to be overridden."

# Log build context and paths for debugging
RUN echo "authUrl.Dockerfile: Build context is $(pwd)"
RUN echo "authUrl.Dockerfile: Listing root directory:" && ls -la /
RUN echo "authUrl.Dockerfile: Listing current directory:" && ls -la .

COPY package.json package-lock.json ./
RUN echo "authUrl.Dockerfile: Installing npm dependencies" && npm install --production
COPY app/ app/
RUN echo "authUrl.Dockerfile: Final directory structure:" && ls -la .
