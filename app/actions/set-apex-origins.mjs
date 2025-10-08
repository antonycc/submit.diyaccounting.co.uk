#!/usr/bin/env node
/**
 * Update CloudFront distribution origins and default behavior based on provided origins (0/1/2 hosts).
 *
 * Usage examples:
 * ```shell
 * $ ./scripts/aws-assume-submit-deployment-role.sh
 * $ ./scripts/list-domains.sh
 * ci-lambdas2.submit.diyaccounting.co.uk
 * EA95FLLZ97JYC
 * d28wz0w96thcu.cloudfront.net
 * [
 *   "ci.submit.diyaccounting.co.uk"
 * ]
 * $ ./app/actions/set-apex-origins.mjs \
 *    --distribution-id EA95FLLZ97JYC \
 *    --origins ci-lambdas2.submit.diyaccounting.co.uk \
 *    ;
 * ```
 */

import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";

function parseArgs(argv) {
  const args = {
    id: process.env.DIST_ID,
    origins: process.env.ORIGINS_CSV,
    region: process.env.AWS_REGION,
    dryRun: /^(1|true|yes)$/i.test(process.env.DRY_RUN || ""),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "-i" || a === "--id" || a === "--distribution-id") args.id = argv[++i];
    else if (a === "-o" || a === "--origins" || a === "--origins-csv") args.origins = argv[++i];
    else if (a === "-r" || a === "--region") args.region = argv[++i];
    else if (a === "-n" || a === "--dry-run") args.dryRun = true;
    else if (!args.origins && !a.startsWith("-")) args.origins = a; // allow positional origins csv
  }
  return args;
}

function printHelp() {
  console.log(`Update CloudFront distribution origins.

Options:
  -i, --id, --distribution-id   CloudFront distribution id (or set DIST_ID env)
  -o, --origins, --origins-csv  Comma-separated list of origin hosts (or set ORIGINS_CSV env)
  -r, --region                  AWS region (defaults to AWS_REGION env)
  -n, --dry-run                 Print planned changes and exit (or set DRY_RUN=1)
  -h, --help                    Show this help

Examples:
  node app/actions/set-apex-origins.mjs --id ABC123 --origins "a.example.com,b.example.com"
  DIST_ID=ABC123 ORIGINS_CSV=a.example.com node app/actions/set-apex-origins.mjs
  DRY_RUN=1 ./app/actions/set-apex-origins.mjs --id ABC123 --origins "a.example.com,b.example.com"

  ./app/actions/set-apex-origins.mjs --distribution-id EA95FLLZ97JYC --origins ci-lambdas2.submit.diyaccounting.co.uk
`);
}

const sanitize = (s) => s.replace(/[^A-Za-z0-9_-]/g, "-");
const parseHosts = (csv) =>
  (csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);

async function main() {
  const { id, origins, region, help, dryRun } = parseArgs(process.argv);
  if (help) {
    printHelp();
    return;
  }

  if (!id) {
    throw new Error("DIST_ID is not set and --id not provided");
  }

  console.log(
    `[set-apex-origins] dist=${id} region=${region || "(default)"} origins=${(origins || "").trim() || "(none)"} dryRun=${String(!!dryRun)}`,
  );

  const client = new CloudFrontClient({ region });
  const hosts = parseHosts(origins || "");

  const getResp = await client.send(new GetDistributionConfigCommand({ Id: id }));
  const etag = getResp.ETag;
  // structuredClone is available in Node 22; fallback if needed
  const cfg = globalThis.structuredClone
    ? structuredClone(getResp.DistributionConfig)
    : JSON.parse(JSON.stringify(getResp.DistributionConfig));

  // Ensure Origins container exists
  cfg.Origins = cfg.Origins || { Quantity: 0, Items: [] };

  const beforeOrigins = getResp.DistributionConfig.Origins?.Items || [];
  const missingBefore = beforeOrigins.filter((o) => !o.CustomHeaders && !o.OriginCustomHeaders).length;
  console.log(
    `[set-apex-origins] fetched origins: ${beforeOrigins.length}, missing CustomHeaders (or OriginCustomHeaders) on fetch: ${missingBefore}`,
  );

  const maintOriginId =
    (cfg.CacheBehaviors?.Items || []).find((b) => b.PathPattern === "/maintenance/*")?.TargetOriginId ||
    cfg.DefaultCacheBehavior.TargetOriginId;

  // Remove any previously added app-* origins
  cfg.Origins.Items = (cfg.Origins.Items || []).filter((o) => !String(o.Id || "").startsWith("app-"));
  cfg.Origins.Quantity = cfg.Origins.Items.length;
  if (cfg.OriginGroups) {
    cfg.OriginGroups.Items = (cfg.OriginGroups.Items || []).filter((g) => g.Id !== "app-failover");
    cfg.OriginGroups.Quantity = cfg.OriginGroups.Items.length;
  }

  if (hosts.length === 0) {
    cfg.DefaultCacheBehavior.TargetOriginId = maintOriginId;
  } else {
    const mkOrigin = (h) => ({
      Id: `app-${sanitize(h)}`,
      DomainName: h,
      OriginPath: "",
      CustomHeaders: { Quantity: 0, Items: [] },
      CustomOriginConfig: {
        HTTPPort: 80,
        HTTPSPort: 443,
        OriginProtocolPolicy: "https-only",
        OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] },
        OriginReadTimeout: 30,
        OriginKeepaliveTimeout: 5,
      },
    });
    cfg.Origins.Items.push(...hosts.map(mkOrigin));
    cfg.Origins.Quantity = cfg.Origins.Items.length;

    if (hosts.length > 1) {
      cfg.OriginGroups = cfg.OriginGroups || { Quantity: 0, Items: [] };
      const group = {
        Id: "app-failover",
        FailoverCriteria: { StatusCodes: { Quantity: 4, Items: [500, 502, 503, 504] } },
        Members: { Quantity: 2, Items: hosts.slice(0, 2).map((h) => ({ OriginId: `app-${sanitize(h)}` })) },
      };
      cfg.OriginGroups.Items = [group, ...(cfg.OriginGroups.Items || []).filter((g) => g.Id !== "app-failover")];
      cfg.OriginGroups.Quantity = cfg.OriginGroups.Items.length;
      cfg.DefaultCacheBehavior.TargetOriginId = "app-failover";
    } else {
      cfg.DefaultCacheBehavior.TargetOriginId = `app-${sanitize(hosts[0])}`;
    }
  }

  // Normalize ALL origins to satisfy UpdateDistribution requirements
  for (const o of cfg.Origins.Items || []) {
    // Ensure OriginPath is a string
    if (typeof o.OriginPath !== "string") o.OriginPath = "";

    // Ensure CustomHeaders exists, even if empty
    if (!o.CustomHeaders || typeof o.CustomHeaders !== "object") {
      o.CustomHeaders = { Quantity: 0, Items: [] };
    } else {
      if (typeof o.CustomHeaders.Quantity !== "number") {
        o.CustomHeaders.Quantity = Array.isArray(o.CustomHeaders.Items) ? o.CustomHeaders.Items.length : 0;
      }
      if (o.CustomHeaders.Quantity === 0 && !Array.isArray(o.CustomHeaders.Items)) {
        // Some SDKs omit Items when Quantity is 0; include it for safety
        o.CustomHeaders.Items = [];
      }
    }

    // Safe defaults for connection settings (accepted by both S3 and Custom origins)
    if (o.ConnectionAttempts == null) o.ConnectionAttempts = 3;
    if (o.ConnectionTimeout == null) o.ConnectionTimeout = 10;

    // Ensure CustomOriginConfig has required fields (if present)
    if (o.CustomOriginConfig) {
      const c = o.CustomOriginConfig;
      if (!c.OriginProtocolPolicy) c.OriginProtocolPolicy = "https-only";
      if (!c.OriginSslProtocols) c.OriginSslProtocols = { Quantity: 1, Items: ["TLSv1.2"] };
      if (c.OriginReadTimeout == null) c.OriginReadTimeout = 30;
      if (c.OriginKeepaliveTimeout == null) c.OriginKeepaliveTimeout = 5;
      if (c.HTTPPort == null) c.HTTPPort = 80;
      if (c.HTTPSPort == null) c.HTTPSPort = 443;
    }
  }

  const afterMissing = (cfg.Origins.Items || []).filter(
    (o) => !o.CustomHeaders || typeof o.CustomHeaders !== "object",
  ).length;
  console.log(
    `[set-apex-origins] normalized origins: ${cfg.Origins.Items.length}, missing CustomHeaders after normalization: ${afterMissing}`,
  );

  if (dryRun) {
    const summary = {
      defaultTarget: cfg.DefaultCacheBehavior.TargetOriginId,
      origins: (cfg.Origins.Items || []).map((o) => ({
        Id: o.Id,
        DomainName: o.DomainName,
        hasCustomHeaders: !!o.CustomHeaders,
        customHeadersQuantity: o.CustomHeaders?.Quantity ?? null,
        customHeaderNames: Array.isArray(o.CustomHeaders?.Items) ? o.CustomHeaders.Items.map((h) => h.HeaderName) : [],
        type: o.S3OriginConfig ? "s3" : "custom",
      })),
      originGroups:
        cfg.OriginGroups?.Items?.map((g) => ({ Id: g.Id, members: g.Members?.Items?.map((m) => m.OriginId) })) || [],
    };
    console.log("[set-apex-origins] DRY RUN summary:");
    console.log(JSON.stringify(summary, null, 2));
    console.log("[set-apex-origins] DRY RUN complete. No changes sent to CloudFront.");
    return;
  }

  await client.send(
    new UpdateDistributionCommand({
      Id: id,
      IfMatch: etag,
      DistributionConfig: cfg,
    }),
  );

  await client.send(
    new CreateInvalidationCommand({
      DistributionId: id,
      InvalidationBatch: {
        CallerReference: `${Date.now()}`,
        Paths: { Quantity: 1, Items: ["/index.html"] },
      },
    }),
  );

  console.log(`Updated distribution ${id}. Set default origin to ${cfg.DefaultCacheBehavior.TargetOriginId}.`);
}

main().catch((err) => {
  try {
    console.error("[set-apex-origins] ERROR:", {
      name: err?.name,
      message: err?.message,
      code: err?.code || err?.Code,
      $metadata: err?.$metadata,
    });
  } catch (_) {
    // fallback if JSON serialization fails
  }
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
});
