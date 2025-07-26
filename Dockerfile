FROM public.ecr.aws/lambda/nodejs:22

COPY package.json package-lock.json ./
RUN npm install --production
COPY src/ src/
