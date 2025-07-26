FROM public.ecr.aws/lambda/nodejs:20

WORKDIR /var/task

ENV HANDLER=main.authUrlHandler

COPY package.json package-lock.json ./
RUN npm install --production
COPY src/ src/

# Use JSON form for CMD and ENTRYPOINT
# Use a shell command in CMD to expand the environment variable
CMD ["sh", "-c", "exec $HANDLER"]

# Use a fixed ENTRYPOINT without environment variables
ENTRYPOINT ["/lambda-entrypoint.sh"]
