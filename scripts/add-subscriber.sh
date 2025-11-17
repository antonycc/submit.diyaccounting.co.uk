#!/bin/bash
# Add a subscriber to product-subscribers.subs (hashes the sub and appends to file)
# Usage: ./add-subscriber.sh <sub>

set -e

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <sub>"
    echo "Example: $0 google-oauth2|123456789"
    exit 1
fi

SUB="$1"
SUBS_FILE="product-subscribers.subs"

# Hash the sub using SHA256
HASHED_SUB=$(echo -n "$SUB" | openssl dgst -sha256 -binary | xxd -p -c 256)

echo "Original sub: $SUB"
echo "Hashed sub: $HASHED_SUB"

# Create the file if it doesn't exist
if [ ! -f "$SUBS_FILE" ]; then
    echo "Creating $SUBS_FILE"
    touch "$SUBS_FILE"
fi

# Check if the hashed sub already exists
if grep -q "^${HASHED_SUB}$" "$SUBS_FILE" 2>/dev/null; then
    echo "Hashed sub already exists in $SUBS_FILE"
    exit 0
fi

# Append the hashed sub to the file
echo "$HASHED_SUB" >> "$SUBS_FILE"
echo "Added hashed sub to $SUBS_FILE"
