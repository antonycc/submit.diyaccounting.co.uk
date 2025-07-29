FROM public.ecr.aws/lambda/nodejs:22

ENV DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX="From Dockerfile"

# Log build context and paths for debugging
RUN echo "[DEBUG_LOG] logReceipt.Dockerfile: Build context is $(pwd)"
RUN echo "[DEBUG_LOG] logReceipt.Dockerfile: Listing root directory:" && ls -la /
RUN echo "[DEBUG_LOG] logReceipt.Dockerfile: Listing current directory:" && ls -la .

COPY package.json package-lock.json ./
RUN echo "[DEBUG_LOG] logReceipt.Dockerfile: Installing npm dependencies" && npm install --production
COPY app/ app/
RUN echo "[DEBUG_LOG] logReceipt.Dockerfile: Final directory structure:" && ls -la .
