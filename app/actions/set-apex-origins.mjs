#!/usr/bin/env node
/**
 * Update CloudFront distribution origins and default behavior based on provided origins (0/1/2 hosts).
 *
 * Usage examples:
 *   node app/actions/set-apex-origins.mjs --id ABC123 --origins "app1.example.com,app2.example.com"
 *   DIST_ID=ABC123 ORIGINS_CSV="app1.example.com" node app/actions/set-apex-origins.mjs
 *   # region is derived from AWS_REGION; can be overridden with --region
 */

import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
} from "@aws-sdk/client-cloudfront";

function parseArgs(argv) {
  const args = { id: process.env.DIST_ID, origins: process.env.ORIGINS_CSV, region: process.env.AWS_REGION };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "-i" || a === "--id" || a === "--distribution-id") args.id = argv[++i];
    else if (a === "-o" || a === "--origins" || a === "--origins-csv") args.origins = argv[++i];
    else if (a === "-r" || a === "--region") args.region = argv[++i];
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
  -h, --help                    Show this help

Examples:
  node app/actions/set-apex-origins.mjs --id ABC123 --origins "a.example.com,b.example.com"
  DIST_ID=ABC123 ORIGINS_CSV=a.example.com node app/actions/set-apex-origins.mjs
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
  const { id, origins, region, help } = parseArgs(process.argv);
  if (help) {
    printHelp();
    return;
  }

  if (!id) {
    throw new Error("DIST_ID is not set and --id not provided");
  }

  const client = new CloudFrontClient({ region });
  const hosts = parseHosts(origins || "");

  const getResp = await client.send(new GetDistributionConfigCommand({ Id: id }));
  const etag = getResp.ETag;
  // structuredClone is available in Node 22; fallback if needed
  const cfg = globalThis.structuredClone
    ? structuredClone(getResp.DistributionConfig)
    : JSON.parse(JSON.stringify(getResp.DistributionConfig));

  const maintOriginId =
    (cfg.CacheBehaviors?.Items || []).find((b) => b.PathPattern === "/maintenance/*")?.TargetOriginId ||
    cfg.DefaultCacheBehavior.TargetOriginId;

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
      OriginCustomHeaders: { Quantity: 0, Items: [] },
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

    // Ensure OriginCustomHeaders exists, even if empty
    if (!o.OriginCustomHeaders) {
      o.OriginCustomHeaders = { Quantity: 0, Items: [] };
    } else if (o.OriginCustomHeaders.Quantity === 0 && !o.OriginCustomHeaders.Items) {
      // Some SDKs omit Items when Quantity is 0; include it for safety
      o.OriginCustomHeaders.Items = [];
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
  console.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
