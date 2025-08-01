# Use the official AWS Lambda Node.js 22 runtime as a parent image
FROM public.ecr.aws/lambda/nodejs:22

# Set the working directory to /var/task (Lambda's working directory)
WORKDIR /var/task

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

RUN echo "bundle.Dockerfile: Build context is $(pwd)"
RUN echo "bundle.Dockerfile: Contents of build context:"
RUN ls -la

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY app/ ./app/

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "app/functions/bundle.httpPost" ]