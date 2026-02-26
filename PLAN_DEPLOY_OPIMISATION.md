Please examine .github/workflows/deploy.yml and consider where we are running `./mvnw --errors clean verify` after we just had a step
for `      - name: Cache Maven build output
          uses: actions/cache@v4` then also simarly it's in `.github/workflows/deploy-cdk-stack.yml` can we relay on the cache more for
the maven artefacts?
