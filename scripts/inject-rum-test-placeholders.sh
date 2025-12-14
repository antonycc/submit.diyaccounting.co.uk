#!/bin/bash
#
# inject-rum-test-placeholders.sh
#
# For test environments (local, CI behaviour tests), replace RUM placeholders with empty strings
# to prevent JavaScript from attempting to load RUM client from invalid URLs.
#
# This script should be run before behaviour tests when RUM infrastructure is not available.

set -euo pipefail

echo "Injecting empty RUM placeholders into HTML files for test environment..."

# Replace RUM placeholders with empty strings in all HTML files
find web/public -type f -name "*.html" -print0 | while IFS= read -r -d '' file; do
  if grep -q '\${RUM_APP_MONITOR_ID}' "$file" || \
     grep -q '\${AWS_REGION}' "$file" || \
     grep -q '\${RUM_IDENTITY_POOL_ID}' "$file" || \
     grep -q '\${RUM_GUEST_ROLE_ARN}' "$file"; then
    echo "  Processing: $file"
    # Use perl for in-place replacement
    perl -i -pe 's/\$\{RUM_APP_MONITOR_ID\}//g; s/\$\{AWS_REGION\}//g; s/\$\{RUM_IDENTITY_POOL_ID\}//g; s/\$\{RUM_GUEST_ROLE_ARN\}//g' "$file"
  fi
done

echo "RUM placeholder injection complete for test environment"
echo "Note: RUM will not initialize because meta tags are now empty"
