import logger from "./logger.js";
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";

function buildTestS3Config(s3Config) {
    s3Config.endpoint = process.env.DIY_SUBMIT_TEST_S3_ENDPOINT;
    s3Config.forcePathStyle = true;
    s3Config.region = "us-east-1";

    if (process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY && process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY) {
        s3Config.credentials = {
            accessKeyId: process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY,
            secretAccessKey: process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY,
        };
    }
}

export default async function logReceipt(key, receipt) {
    const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
    const receiptsBucketPostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
    const {hostname} = new URL(homeUrl);
    const dashedDomain = hostname.split('.').join('-');
    const receiptsBucketFullNameName = `${dashedDomain}-${receiptsBucketPostfix}`;

    // Configure S3 client for containerized MinIO if environment variables are set
    const s3Config = {};
    if (process.env.NODE_ENV !== "stubbed" && process.env.DIY_SUBMIT_TEST_S3_ENDPOINT) {
        buildTestS3Config(s3Config);
    }

    if (process.env.NODE_ENV === "stubbed") {
        logger.warn({message: ".NODE_ENV environment variable is stubbedL No receipt saved."});
    } else {
        const s3Client = new S3Client(s3Config);
        await s3Client.send(
            new PutObjectCommand({
                Bucket: receiptsBucketFullNameName,
                Key: key,
                Body: JSON.stringify(receipt),
                ContentType: "application/json",
            }),
        );
    }
}
