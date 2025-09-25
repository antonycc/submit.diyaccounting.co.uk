# Default Dockertfile used for layer caching for CDK builds
FROM public.ecr.aws/lambda/nodejs:22
COPY package.json package-lock.json product-catalogue.toml ./
RUN npm ci --omit=dev
COPY app/ app/
