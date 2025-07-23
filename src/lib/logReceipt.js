import logger from "./logger.js";
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";

function buildTestS3Config(s3Config) {
    return {
        endpoint: process.env.DIY_SUBMIT_TEST_S3_ENDPOINT,
        region: "us-east-1",
        credentials: {
            accessKeyId: process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY,
            secretAccessKey: process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY,
        },
        forcePathStyle: true,
    };
}

export default async function logReceipt(key, receipt) {
    const homeUrl = process.env.DIY_SUBMIT_HOME_URL;
    const receiptsBucketPostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
    const {hostname} = new URL(homeUrl);
    const dashedDomain = hostname.split('.').join('-');
    const receiptsBucketFullName = `${dashedDomain}-${receiptsBucketPostfix}`;

    // Configure S3 client for containerized MinIO if environment variables are set
    let s3Config = {};
    if (process.env.NODE_ENV !== "stubbed" && process.env.DIY_SUBMIT_TEST_S3_ENDPOINT) {
         s3Config = buildTestS3Config(s3Config);
    }

    if (process.env.NODE_ENV === "stubbed") {
        logger.warn({message: ".NODE_ENV environment variable is stubbedL No receipt saved."});
    } else {
        const s3Client = new S3Client(s3Config);
        try {
            await s3Client.send(
                new PutObjectCommand({
                    Bucket: receiptsBucketFullName,
                    Key: key,
                    Body: JSON.stringify(receipt),
                    ContentType: "application/json",
                }),
            );
        } catch (error) {
            logger.error({message: "Failed to log receipt to S3", error});
            throw new Error(`Failed to log receipt: ${error.message}`);
        }
    }
}
