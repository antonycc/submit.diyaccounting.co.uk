// app/lib/s3Env.js
import { S3Client } from "@aws-sdk/client-s3";

export function makeReceiptsS3(env = process.env) {
  const homeUrl = env.DIY_SUBMIT_HOME_URL;
  const postfix = env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
  const { hostname } = new URL(homeUrl);
  const envPrefix = homeUrl === "https://submit.diyaccounting.co.uk/" ? "prod." : "";
  const dashedDomain = `${envPrefix}${hostname}`.split(".").join("-");
  const Bucket = `${dashedDomain}-${postfix}`;

  let config = {};
  if (env.NODE_ENV !== "stubbed" && env.DIY_SUBMIT_TEST_S3_ENDPOINT && env.DIY_SUBMIT_TEST_S3_ENDPOINT !== "off") {
    config = {
      endpoint: env.DIY_SUBMIT_TEST_S3_ENDPOINT,
      region: "us-east-1",
      credentials: {
        accessKeyId: env.DIY_SUBMIT_TEST_S3_ACCESS_KEY,
        secretAccessKey: env.DIY_SUBMIT_TEST_S3_SECRET_KEY,
      },
      forcePathStyle: true,
    };
  }

  return { s3: new S3Client(config), Bucket };
}
