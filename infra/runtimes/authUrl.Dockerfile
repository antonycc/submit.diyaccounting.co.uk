FROM public.ecr.aws/lambda/nodejs:22

ENV DIY_SUBMIT_HMRC_BASE_URI="From Dockerfile"
ENV DIY_SUBMIT_HMRC_CLIENT_ID="From Dockerfile"
ENV DIY_SUBMIT_HOME_URL="From Dockerfile"

COPY package.json package-lock.json ./
RUN npm install --production
COPY src/ src/
