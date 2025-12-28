# Default Dockertfile used for layer caching for CDK builds
FROM public.ecr.aws/lambda/nodejs:22
COPY package.json package-lock.json ./
COPY web/public/product-catalogue.toml web/public/product-catalogue.toml
RUN npm ci --omit=dev
COPY app/lib app/lib
COPY app/functions app/functions
COPY app/data app/data
COPY app/services app/services
