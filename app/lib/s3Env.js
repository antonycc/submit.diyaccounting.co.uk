// app/lib/s3Env.js
import { S3Client } from "@aws-sdk/client-s3";

export function makeReceiptsS3(env = process.env) {
  const Bucket = env.DIY_SUBMIT_RECEIPTS_BUCKET_NAME;

  let config = {};
  if (env.NODE_ENV !== "stubbed" && env.TEST_S3_ENDPOINT && env.TEST_S3_ENDPOINT !== "off") {
    config = {
      endpoint: env.TEST_S3_ENDPOINT,
      region: "us-east-1",
      credentials: {
        accessKeyId: env.TEST_S3_ACCESS_KEY,
        secretAccessKey: env.TEST_S3_SECRET_KEY,
      },
      forcePathStyle: true,
    };
  }

  return { s3: new S3Client(config), Bucket };
}
