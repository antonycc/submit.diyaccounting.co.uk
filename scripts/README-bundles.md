# Bundle Management Scripts

This directory contains scripts for managing product bundle subscriptions.

## Scripts

### add-subscriber.sh

Hashes a user's sub (subject identifier) and adds it to the product-subscribers.subs file.

**Usage:**
```bash
./scripts/add-subscriber.sh <sub>
```

**Example:**
```bash
./scripts/add-subscriber.sh "google-oauth2|123456789"
```

**Output:**
```
Original sub: google-oauth2|123456789
Hashed sub: abc123def456...
Added hashed sub to product-subscribers.subs
```

The script:
- Uses SHA256 to hash the sub (matching app/lib/subHasher.js)
- Appends the hashed sub to product-subscribers.subs
- Prevents duplicate entries
- Creates the file if it doesn't exist

### add-bundle.sh

Adds a bundle to DynamoDB for a user (identified by hashed sub) with proper expiry and TTL.

**Usage:**
```bash
./scripts/add-bundle.sh <hashed-sub> <bundle-id> [environment]
```

**Parameters:**
- `hashed-sub`: The SHA256 hash of the user's sub
- `bundle-id`: The bundle ID (e.g., "test", "guest", "business")
- `environment`: Optional, defaults to "ci" (e.g., "ci", "prod")

**Example:**
```bash
./scripts/add-bundle.sh da4609210dfd123eb14520a79f533244e0411058911fc4508656056e2b3282ec test ci
```

**Output:**
```
Adding bundle: test with timeout P1D for hashed sub: da4609...
Calculated expiry: 2025-11-18T00:17:39.161Z
TTL Unix timestamp: 1766017059
TTL datestamp: 2025-12-18T00:17:39.161Z
Using table: ci-submit-bundles
Item to insert:
{
  "hashedSub": {"S": "da4609..."},
  "bundleId": {"S": "test"},
  "createdAt": {"S": "2025-11-17T00:17:39.165Z"},
  "expiry": {"S": "2025-11-18T00:17:39.161Z"},
  "ttl": {"N": "1766017059"},
  "ttl_datestamp": {"S": "2025-12-18T00:17:39.161Z"}
}
Bundle added successfully!
```

The script:
- Reads bundle timeout from product-catalogue.toml
- Calculates expiry based on ISO 8601 duration (P1D = 1 day, P1M = 1 month)
- Calculates TTL as 1 month after expiry
- Generates DynamoDB JSON in the correct format
- Inserts the bundle into the environment-specific DynamoDB table

**Requirements:**
- AWS credentials configured (for accessing DynamoDB)
- product-catalogue.toml file in repository root
- DynamoDB table must exist: `{environment}-submit-bundles`

## File: product-subscribers.subs

This file contains hashed user subs (one per line) for automated bundle provisioning during deployment.

**Format:**
```
# Comments start with #
da4609210dfd123eb14520a79f533244e0411058911fc4508656056e2b3282ec
e8f4a2b1c9d3e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

**Used by:**
- `.github/workflows/deploy-environment.yml` - Reads this file during the `provision-bundles` job
- Automatically provisions bundles for all subscribers during deployment

## Workflow Integration

The deploy-environment.yml workflow includes a `provision-bundles` job that:

1. Runs after the DynamoDB tables are deployed
2. Reads hashed subs from product-subscribers.subs
3. For each hashed sub:
   - Adds "test" bundle (non-production environments only)
   - Adds "guest" bundle (all environments)
4. Skips empty lines and comments

**To add a new subscriber:**
```bash
# 1. Hash and add the subscriber
./scripts/add-subscriber.sh "google-oauth2|123456789"

# 2. Commit the change
git add product-subscribers.subs
git commit -m "Add new subscriber"
git push

# 3. Bundles will be automatically provisioned on next deployment
```

## Bundle Data Model

### New Model (Current)
```json
{
  "hashedSub": {"S": "da4609..."},
  "bundleId": {"S": "test"},
  "createdAt": {"S": "2025-11-15T23:00:17.904Z"},
  "expiry": {"S": "2025-11-16T23:00:17.904Z"},
  "ttl": {"N": "1763337600"},
  "ttl_datestamp": {"S": "2025-12-16T23:00:17.904Z"}
}
```

**Key features:**
- `expiry`: ISO timestamp with millisecond precision
- `ttl`: Unix timestamp, 1 month after expiry (DynamoDB TTL attribute)
- `ttl_datestamp`: ISO string representation of TTL date
- `bundleStr`: Not stored (removed from model, reconstructed on read)

## Troubleshooting

### Script reports "Hashed sub already exists"
This is normal and prevents duplicates. No action needed.

### AWS ResourceNotFoundException
The DynamoDB table doesn't exist. Ensure:
- You're using the correct environment name
- The data stack has been deployed
- AWS credentials have access to the table

### Invalid timeout format
Ensure the bundle exists in product-catalogue.toml with a valid timeout:
- `P1D` - 1 day
- `P1M` - 1 month
- `P1Y` - 1 year

### Hash mismatch
Verify the hash using Node.js:
```bash
node -e "import('./app/lib/subHasher.js').then(({ hashSub }) => console.log(hashSub('your-sub-here')))"
```
