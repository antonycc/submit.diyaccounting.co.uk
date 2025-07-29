FROM public.ecr.aws/lambda/nodejs:22

ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
ENV DIY_SUBMIT_TEST_RECEIPTS_BUCKET="From Dockerfile"

# Log build context and paths for debugging
RUN echo "[DEBUG_LOG] submitVat.Dockerfile: Build context is $(pwd)"
RUN echo "[DEBUG_LOG] submitVat.Dockerfile: Listing root directory:" && ls -la /
RUN echo "[DEBUG_LOG] submitVat.Dockerfile: Listing current directory:" && ls -la .

COPY package.json package-lock.json ./
RUN echo "[DEBUG_LOG] submitVat.Dockerfile: Installing npm dependencies" && npm install --production
COPY app/ app/
RUN echo "[DEBUG_LOG] submitVat.Dockerfile: Final directory structure:" && ls -la .
