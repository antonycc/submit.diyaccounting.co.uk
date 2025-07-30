FROM public.ecr.aws/lambda/nodejs:22

ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_ID="From Dockerfile"
ENV DIY_SUBMIT_HOME_URL="From Dockerfile"

# Log build context and paths for debugging
RUN echo "authUrl.Dockerfile: Build context is $(pwd)"
RUN echo "authUrl.Dockerfile: Listing root directory:" && ls -la /
RUN echo "authUrl.Dockerfile: Listing current directory:" && ls -la .

COPY package.json package-lock.json ./
RUN echo "authUrl.Dockerfile: Installing npm dependencies" && npm install --production
COPY app/ app/
RUN echo "authUrl.Dockerfile: Final directory structure:" && ls -la .
