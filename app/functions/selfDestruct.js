// app/functions/selfDestruct.js

import { CloudFormationClient, DeleteStackCommand, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { extractRequest, httpOkResponse, httpServerErrorResponse } from "../lib/responses.js";

export async function handler(event, context) {
  const client = new CloudFormationClient({ region: process.env.AWS_REGION || "eu-west-2" });
  
  context.getRemainingTimeInMillis = context.getRemainingTimeInMillis || (() => 900000); // 15 minutes default
  
  console.log("Starting self-destruct sequence...");
  
  let request = "Not created";
  try {
    request = extractRequest(event);
    
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
    const selfDestructStackName = process.env.SELF_DESTRUCT_STACK_NAME;
    
    console.log(`Stacks to delete in order: ${stacksToDelete.join(", ")}`);
    
    const results = [];
    
    // Delete stacks in order
    for (const stackName of stacksToDelete) {
      try {
        console.log(`Checking if stack ${stackName} exists...`);
        await deleteStackIfExistsAndWait(client, context, stackName);
        results.push({ stackName, status: "deleted", error: null });
      } catch (error) {
        console.log(`Error deleting stack ${stackName}: ${error.message}`);
        results.push({ stackName, status: "error", error: error.message });
      }
    }
    
    // Delete self-destruct stack last if no errors
    if (selfDestructStackName && results.every(r => r.status !== "error")) {
      try {
        console.log(`Checking if stack ${selfDestructStackName} exists...`);
        await deleteStackIfExistsAndWait(client, context, selfDestructStackName, true);
        results.push({ stackName: selfDestructStackName, status: "deleted", error: null });
      } catch (error) {
        console.log(`Error deleting stack ${selfDestructStackName}: ${error.message}`);
        results.push({ stackName: selfDestructStackName, status: "error", error: error.message });
      }
    }
    
    const hasErrors = results.some(r => r.status === "error");
    
    if (hasErrors) {
      console.log("One or more stacks failed to delete.");
    } else {
      console.log("Self-destruct sequence completed");
    }
    
    const response = {
      statusCode: hasErrors ? 500 : 200,
      body: JSON.stringify({
        message: "Self-destruct sequence completed",
        results,
        timestamp: new Date().toISOString()
      })
    };
    
    return httpOkResponse({
      request,
      data: {
        message: "Self-destruct sequence completed",
        results,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error("Error in self-destruct handler:", error);
    return httpServerErrorResponse({
      request,
      data: { 
        error: error.message, 
        message: "Internal Server Error in self-destruct handler" 
      }
    });
  }
}

async function deleteStackIfExistsAndWait(client, context, stackName, isSelfDestruct = false) {
  // Check if stack exists
  try {
    await client.send(new DescribeStacksCommand({ StackName: stackName }));
  } catch (error) {
    if (error.name === "ValidationError" || error.message?.includes("does not exist")) {
      console.log(`Stack ${stackName} does not exist, skipping`);
      return;
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
  }
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
    if (context.getRemainingTimeInMillis() < 30000) { // 30 seconds buffer
      console.log(`Timeout approaching, stopping wait for stack ${stackName}`);
      break;
    }
    
    try {
      await client.send(new DescribeStacksCommand({ StackName: stackName }));
      console.log(`Stack ${stackName} still exists, waiting...`);
    } catch (error) {
      if (error.name === "ValidationError" || error.message?.includes("does not exist")) {
        console.log(`Stack ${stackName} deleted.`);
        return true;
      }
      console.log(`Error polling stack ${stackName}: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, interval * 1000));
    waited += interval;
  }
  
  console.log(`Timeout waiting for stack ${stackName} deletion.`);
  return false;
}