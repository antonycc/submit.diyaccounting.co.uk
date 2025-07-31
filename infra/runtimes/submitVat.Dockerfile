FROM public.ecr.aws/lambda/nodejs:22

ENV DIY_SUBMIT_HMRC_BASE_URI="The default value from the Dockerfile is intended to be overridden."
ENV DIY_SUBMIT_TEST_RECEIPTS_BUCKET="The default value from the Dockerfile is intended to be overridden."

# Log build context and paths for debugging
RUN echo "submitVat.Dockerfile: Build context is $(pwd)"
RUN echo "submitVat.Dockerfile: Listing root directory:" && ls -la /
RUN echo "submitVat.Dockerfile: Listing current directory:" && ls -la .

COPY package.json package-lock.json ./
RUN echo "submitVat.Dockerfile: Installing npm dependencies" && npm install --production
COPY app/ app/
RUN echo "submitVat.Dockerfile: Final directory structure:" && ls -la .
