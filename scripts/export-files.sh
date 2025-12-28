#!/usr/bin/env bash

echo '.github/workflows/deploy.yml' > repository-contents.txt
echo '.github/workflows/deploy-environment.yml' >> repository-contents.txt
echo '.github/workflows/scale-to.yml' >> repository-contents.txt
echo '.github/workflows/set-origins.yml' >> repository-contents.txt
echo '.github/workflows/test.yml' >> repository-contents.txt
echo '.github/actions/scale-to/action.yml' >> repository-contents.txt
echo '.github/actions/set-origins/action.yml' >> repository-contents.txt
echo '.github/actions/get-names/action.yml' >> repository-contents.txt
find . -type f | grep -v '.env\|.DS_Store\|.git\|.idea\|.junie\|.mvn\|.run\|target\|_developers\|coverage\|node_modules\|prompts\|wiremock-recordings\|.png\|web.iml\|hmrc-test-user.json\|package-lock.json' \
  >> repository-contents.txt \
;
