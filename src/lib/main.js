#!/usr/bin/env node
// src/lib/main.js

import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fetch from "node-fetch";

const HMRC_BASE = "https://api.service.hmrc.gov.uk";

// GET /api/auth-url?state={state}
export async function authUrlHandler(event) {
  const state = event.queryStringParameters?.state;
  if (!state) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing state" }) };
  }
  const clientId = process.env.HMRC_CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const scope = "write:vat read:vat";
  const authUrl = `${HMRC_BASE}/oauth/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;
  return { statusCode: 200, body: JSON.stringify({ authUrl }) };
}

// POST /api/exchange-token
export async function exchangeTokenHandler(event) {
  const { code } = JSON.parse(event.body || "{}");
  if (!code) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing code" }) };
  }
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.HMRC_CLIENT_ID,
    client_secret: process.env.HMRC_CLIENT_SECRET,
    redirect_uri: process.env.REDIRECT_URI,
    code,
  });
  const res = await fetch(`${HMRC_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    const err = await res.text();
    return { statusCode: res.status, body: JSON.stringify({ error: err }) };
  }
  const { access_token } = await res.json();
  return { statusCode: 200, body: JSON.stringify({ accessToken: access_token }) };
}

// POST /api/submit-vat
export async function submitVatHandler(event) {
  const { vatNumber, periodKey, vatDue, accessToken } = JSON.parse(event.body || "{}");
  if (!vatNumber || !periodKey || !vatDue || !accessToken) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing parameters" }) };
  }
  const payload = {
    periodKey,
    vatDueSales: parseFloat(vatDue),
    vatDueAcquisitions: 0,
    totalVatDue: parseFloat(vatDue),
    vatReclaimedCurrPeriod: 0,
    netVatDue: parseFloat(vatDue),
    totalValueSalesExVAT: 0,
    totalValuePurchasesExVAT: 0,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
    finalised: true,
  };
  const res = await fetch(
      `${HMRC_BASE}/organisations/vat/${vatNumber}/returns`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
  );
  if (!res.ok) {
    const err = await res.text();
    return { statusCode: res.status, body: JSON.stringify({ error: err }) };
  }
  const receipt = await res.json();
  return { statusCode: 200, body: JSON.stringify(receipt) };
}

// POST /api/log-receipt
export async function logReceiptHandler(event) {
  const receipt = JSON.parse(event.body || "{}");
  const key = `receipts/${receipt.formBundleNumber}.json`;
  try {
    const s3Config = {};
    
    // Configure S3 client for containerized MinIO if environment variables are set
    if (process.env.S3_ENDPOINT) {
      s3Config.endpoint = process.env.S3_ENDPOINT;
      s3Config.forcePathStyle = true;
      s3Config.region = 'us-east-1';
      
      if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
        s3Config.credentials = {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        };
      }
    }
    
    const s3Client = new S3Client(s3Config);
    await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.RECEIPTS_BUCKET,
          Key: key,
          Body: JSON.stringify(receipt),
          ContentType: "application/json",
        })
    );
    return { statusCode: 200, body: JSON.stringify({ status: "receipt logged" }) };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to log receipt", details: err.message }),
    };
  }
}

export function main(args) {
  console.log(`Run with: ${JSON.stringify(args)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  main(args);
}
