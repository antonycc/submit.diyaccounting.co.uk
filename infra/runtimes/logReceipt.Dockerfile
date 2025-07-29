FROM public.ecr.aws/lambda/nodejs:22

ENV DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX="From Dockerfile"

COPY ../../package.json ../../package-lock.json ./
RUN npm install --production
COPY ../../src/ src/
