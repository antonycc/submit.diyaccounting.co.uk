# Default Dockertfile used for layer caching for CDK builds
FROM public.ecr.aws/lambda/nodejs:22
COPY package.json package-lock.json ./
RUN npm install --production
COPY app/ app/
