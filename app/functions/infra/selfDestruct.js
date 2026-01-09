// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/selfDestruct.js

import { extractRequest, http200OkResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";

let cloudFormationClient = null;
let cloudFormationClientUE1 = null;
let s3Client = null;

async function getCloudFormationClient(region = "eu-west-2") {
  if (region === "us-east-1") {
    if (!cloudFormationClientUE1) {
      const { CloudFormationClient } = await import("@aws-sdk/client-cloudformation");
      cloudFormationClientUE1 = new CloudFormationClient({ region: "us-east-1" });
    }
    return cloudFormationClientUE1;
  } else {
    if (!cloudFormationClient) {
      const { CloudFormationClient } = await import("@aws-sdk/client-cloudformation");
      cloudFormationClient = new CloudFormationClient({ region: process.env.AWS_REGION || "eu-west-2" });
    }
    return cloudFormationClient;
  }
}

async function getS3Client() {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return s3Client;
}

export async function ingestHandler(event, context) {
  const client = await getCloudFormationClient();
  const clientUE1 = await getCloudFormationClient("us-east-1");

  // Ensure context has a fallback for getRemainingTimeInMillis
  const safeContext = {
    ...context,
    getRemainingTimeInMillis: context.getRemainingTimeInMillis || (() => 900000), // 15 minutes default
  };

  console.log("Starting self-destruct sequence...");

  let request = "Not created";
  try {
    request = extractRequest(event);

    if (process.env.EDGE_ORIGIN_BUCKET) {
      await emptyBucket(process.env.EDGE_ORIGIN_BUCKET);
    }

    // Stack deletion order (reverse of creation dependency order)
    const stacksToDelete = [];
    addStackNameIfPresent(stacksToDelete, process.env.OPS_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.PUBLISH_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.EDGE_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.API_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.AUTH_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.HMRC_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.ACCOUNT_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.DEV_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.DEV_UE1_STACK_NAME);
    const selfDestructStackName = process.env.SELF_DESTRUCT_STACK_NAME;

    console.log(`Stacks to delete in order: ${stacksToDelete.join(", ")}`);

    const results = [];

    // Delete stacks in order, the primary region first then us-east-1
    for (const stackName of stacksToDelete) {
      try {
        console.log(`Checking if stack ${stackName} exists in region eu-west-2...`);
        let deleted = await deleteStackIfExistsAndWait(client, safeContext, stackName);
        if (!deleted) {
          console.log(`Checking if stack ${stackName} exists in region us-east-1...`);
          deleted = await deleteStackIfExistsAndWait(clientUE1, safeContext, stackName);
        }
        results.push({
          stackName,
          status: deleted ? "deleted" : "skipped",
          error: null,
        });
      } catch (error) {
        console.log(`Error deleting stack ${stackName}: ${error.message}`);
        results.push({ stackName, status: "error", error: error.message });
      }
    }

    // Delete self-destruct stack last if no errors
    if (selfDestructStackName && results.every((r) => r.status !== "error")) {
      try {
        console.log(`Checking if stack ${selfDestructStackName} exists in region eu-west-2...`);
        const deleted = await deleteStackIfExistsAndWait(client, safeContext, selfDestructStackName, true);
        results.push({
          stackName: selfDestructStackName,
          status: deleted ? "deleted" : "skipped",
          error: null,
        });
      } catch (error) {
        console.log(`Error deleting stack ${selfDestructStackName}: ${error.message}`);
        results.push({ stackName: selfDestructStackName, status: "error", error: error.message });
      }
    }

    const hasErrors = results.some((r) => r.status === "error");

    if (hasErrors) {
      console.log("One or more stacks failed to delete.");
      return http500ServerErrorResponse({
        request,
        message: "Self-destruct sequence completed with errors",
        data: { results, timestamp: new Date().toISOString() },
      });
    } else {
      console.log("Self-destruct sequence completed");
      return http200OkResponse({
        request,
        data: {
          message: "Self-destruct sequence completed",
          results,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("Error in self-destruct ingestHandler:", error);
    return http500ServerErrorResponse({
      request,
      message: "Internal Server Error in self-destruct ingestHandler",
      data: { error: error.message },
    });
  }
}

async function deleteStackIfExistsAndWait(client, context, stackName, isSelfDestruct = false) {
  // Check if a stack exists
  const { DescribeStacksCommand, DeleteStackCommand } = await import("@aws-sdk/client-cloudformation");

  try {
    await client.send(new DescribeStacksCommand({ StackName: stackName }));
  } catch (error) {
    if (error.message?.includes("does not exist")) {
      console.log(`Stack ${stackName} does not exist, skipping`);
      return false; // Stack doesn't exist
    }
    throw error;
  }

  console.log(`Deleting stack: ${stackName}`);
  await client.send(new DeleteStackCommand({ StackName: stackName }));
  console.log(`Deletion initiated for stack: ${stackName}`);

  // Wait for stack to be fully deleted before proceeding (except for self-destruct stack)
  if (!isSelfDestruct) {
    const deleted = await waitForStackDeletion(client, context, stackName, 600); // 10 min timeout
    if (!deleted) {
      console.log(`Stack ${stackName} did not delete in time.`);
    }
    return deleted;
  }

  return true; // Self-destruct stack deletion was initiated
}

function addStackNameIfPresent(stackList, stackName) {
  if (stackName && stackName.trim()) {
    stackList.push(stackName);
  }
}

async function waitForStackDeletion(client, context, stackName, maxWaitSeconds) {
  let waited = 0;
  const interval = 10; // seconds

  while (waited < maxWaitSeconds) {
    // Check remaining time
    if (context.getRemainingTimeInMillis() < 30000) {
      // 30 seconds buffer
      console.log(`Timeout approaching, stopping wait for stack ${stackName}`);
      break;
    }

    try {
      const { DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
      await client.send(new DescribeStacksCommand({ StackName: stackName }));
      console.log(`Stack ${stackName} still exists, waiting...`);
    } catch (error) {
      if (error.message?.includes("does not exist")) {
        console.log(`Stack ${stackName} deleted.`);
        return true;
      }
      console.log(`Error polling stack ${stackName}: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    waited += interval;
  }

  console.log(`Timeout waiting for stack ${stackName} deletion.`);
  return false;
}

async function resolveBucketRegion(bucketName) {
  try {
    const probe = await getS3Client();
    const { GetBucketLocationCommand } = await import("@aws-sdk/client-s3");
    const out = await probe.send(new GetBucketLocationCommand({ Bucket: bucketName }));
    const loc = out.LocationConstraint;
    if (!loc) return "us-east-1";
    if (loc === "EU") return "eu-west-1";
    return loc;
  } catch (err) {
    console.warn(`Falling back to default region for bucket ${bucketName}: ${err.message}`);
    return process.env.AWS_REGION || "eu-west-2";
  }
}

async function emptyBucket(bucketName) {
  console.log(`Emptying bucket: ${bucketName}`);

  const region = await resolveBucketRegion(bucketName);
  const { S3Client } = await import("@aws-sdk/client-s3");
  const s3Client = new S3Client({ region });

  const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");

  let continuationToken;
  do {
    console.log(`Retrieving bucket contents for bucket ${bucketName} (continuation token: ${continuationToken})`);
    try {
      const list = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        }),
      );

      if (list.Contents && list.Contents.length > 0) {
        console.log(`Deleting ${list.Contents.length} objects from bucket ${bucketName}`);
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: list.Contents.map((o) => ({ Key: o.Key })),
              Quiet: true,
            },
          }),
        );
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } catch (error) {
      console.error(`Error retrieving bucket contents for bucket ${bucketName}: ${error.message}`);
      console.log(`Error retrieving bucket contents for bucket ${bucketName}: stack trace: ${error.stack}`);
      continuationToken = undefined;
    }
  } while (continuationToken);

  console.log(`Bucket ${bucketName} emptied (or failed while emptying) successfully.`);
}
