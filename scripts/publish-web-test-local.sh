#!/usr/bin/env bash
# Usage: ./scripts/publish-web-test-local.sh <sourceReport> <targetTest>
# e.g. ./scripts/publish-web-test-local.sh target/behaviour-test-results/test-report-submitVatBehaviour.json 'web-test-local'
sourceReport="${1?Missing sourceReport argument}"
sourceTestName=$(jq -r '.testName' "${sourceReport?}")
reportDir=$(dirname "${sourceReport?}")
targetTest="${2-'web-test-local'}"
targetTestDir="web/public/tests/behaviour-test-results/${targetTest?}/"
targetTestReportDir="web/public/tests/test-reports/${targetTest?}/"
mkdir -p "${targetTestDir?}"
mkdir -p "${targetTestReportDir?}"
cp -v "${sourceReport?}" "web/public/tests/test-report-${targetTest?}.json"
cat "web/public/tests/test-report-${targetTest?}.json" | jq '.artifacts.screenshots.[]' --raw-output
# find the full path of each file in web/public/tests/test-report-web-test-local.json
# under the containing directory of sourceReport
# and copy each file to web/public/tests/behaviour-test-results/web-test-local/
cat "web/public/tests/test-report-${targetTest?}.json" \
| jq '.artifacts.screenshots.[]' --raw-output \
| while read -r screenshotFilename; do
  screenshotPath=$(find "${reportDir?}" -name "${screenshotFilename?}" | head -1)
  # fullPath="${reportDir?}/${screenshotPath?}"
  cp -v "${screenshotPath?}" "${targetTestDir?}"
done
# If sourceTestName is not the same as targetTest, then replace occurrences of sourceTestName in web/public/tests/test-report-web-test-local.json with targetTest
if [[ "${sourceTestName?}" != "${targetTest?}" ]]; then
  # Replace occurrences of sourceTestName in web/public/tests/test-report-web-test-local.json with targetTest
  sed -i '' "s/${sourceTestName?}/${targetTest?}/g" "web/public/tests/test-report-${targetTest?}.json"
fi
# Copy target/test-reports/html-report to web/public/tests/test-reports/web-test-local
cp -rv "target/test-reports/html-report" "${targetTestReportDir?}"
