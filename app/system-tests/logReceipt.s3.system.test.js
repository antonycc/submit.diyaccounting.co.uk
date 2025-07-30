// app/system-tests/logReceipt.s3.system.test.js

import {describe, beforeAll, afterAll, beforeEach, it, expect, vi} from "vitest";
import {GenericContainer} from "testcontainers";
import {S3Client, CreateBucketCommand, PutObjectCommand, HeadBucketCommand, GetObjectCommand} from "@aws-sdk/client-s3";
import dotenv from 'dotenv';

import {httpPost as logReceiptHandler} from "@app/functions/logReceipt.js";

//dotenv.config({path: '.env.test'});
dotenv.config({ path: '.env.proxy' });
//dotenv.config();

describe("System Test – persist receipts to containerised S3", () => {
    let container;
    let s3Client;
    const bucketNamePostfix = process.env.DIY_SUBMIT_RECEIPTS_BUCKET_POSTFIX;
    const hostname = "hmrc.test.redirect";
    const dashedDomain = hostname.split('.').join('-');
    const receiptsBucketFullName = `${dashedDomain}-${bucketNamePostfix}`;
    const originalEnv = process.env;
    const optionalTestS3AccessKey = process.env.DIY_SUBMIT_TEST_S3_ACCESS_KEY;
    const optionalTestS3SecretKey = process.env.DIY_SUBMIT_TEST_S3_SECRET_KEY;

    beforeAll(async () => {
        container = await new GenericContainer("minio/minio")
            .withExposedPorts(9000)
            .withEnvironment({
                MINIO_ROOT_USER: optionalTestS3AccessKey,
                MINIO_ROOT_PASSWORD: optionalTestS3SecretKey,
            })
            .withCommand(["server", "/data"])
            .start();

        // Capture logs from the container and output them
        const logsStreamBefore = await container.logs();
        logsStreamBefore.setEncoding("utf8");
        logsStreamBefore.on("data", (chunk) => {
            console.log(chunk);
        });

        const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;

        s3Client = new S3Client({
            endpoint,
            region: "us-east-1",
            credentials: {
                accessKeyId: optionalTestS3AccessKey,
                secretAccessKey: optionalTestS3SecretKey,
            },
            forcePathStyle: true,
        });

        // Ensure bucket exists
        let bucketExistsAfter = false
        try {
            let bucketExistsBefore;
            try {
                await s3Client.send(new HeadBucketCommand({ Bucket: receiptsBucketFullName }));
                bucketExistsBefore = true;
            } catch (error) {
                console.error("Bucket does not exist or access is denied:", error);
                bucketExistsBefore = false;
            }

            // Create bucket if needed
            if (!bucketExistsBefore) {
                try {
                    const bucketCreationResponse = await s3Client.send(
                        new CreateBucketCommand({ Bucket: receiptsBucketFullName })
                    );
                    console.log("Bucket creation response:", bucketCreationResponse);
                } catch (error) {
                    console.error("Error creating bucket:", error);
                }
            }

            try {
                await s3Client.send(new HeadBucketCommand({ Bucket: receiptsBucketFullName }));
                bucketExistsAfter = true;
            } catch (error) {
                console.error("Bucket does not exist or access is denied:", error);
                bucketExistsAfter = false;
            }
        } catch (error) {
            console.error(`Error ensuring bucket exists,  bucket: ${receiptsBucketFullName} on endpoint: ${endpoint}`, error);
            throw error;
        }

        // Capture logs from the container and output them
        const logsStreamAfter = await container.logs();
        logsStreamAfter.setEncoding("utf8");
        logsStreamAfter.on("data", (chunk) => {
            console.log(chunk);
        });

        // Error if bucket creation failed
        if (!bucketExistsAfter) {
            throw new Error(`Failed to create or access (no exception caught) bucket: ${receiptsBucketFullName} on endpoint: ${endpoint}`);
        }

        // Set the environment variables to the tests find the S3 endpoint
        process.env = {
            ...originalEnv,
            DIY_SUBMIT_TEST_S3_ENDPOINT: endpoint,
        }
    }, 20000); // 20s timeout to accommodate container startup

    afterAll(async () => {
        if (container) {
            await container.stop();
        }
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("full flow: log receipt and retrieve from S3", async () => {
            const receipt = {
                formBundleNumber: `test-FB123`,
                chargeRefNumber: `test-CR456`,
                processingDate: new Date().toISOString(),
            }

            // Log receipt (S3 putObject via handler)
            const result = await logReceiptHandler({body: JSON.stringify(receipt)});

            const body = JSON.parse(result.body);
            expect(result.statusCode).toBe(200);
            expect(body.receipt).not.toBeUndefined;
            expect(body.receipt.formBundleNumber).not.toBeUndefined;
            expect(body.receipt.formBundleNumber).toBe(receipt.formBundleNumber);

            // Retrieve the stored receipt directly from the containerized S3
            const getObjectOutput = await s3Client.send(
                new GetObjectCommand({
                    Bucket: receiptsBucketFullName,
                    Key: `receipts/${receipt.formBundleNumber}.json`,
                }),
            );

            const receiptFromS3 = await streamToString(getObjectOutput.Body);

            const storedReceipt = JSON.parse(receiptFromS3);

            // Assertions
            expect(storedReceipt.formBundleNumber).toEqual(receipt.formBundleNumber);
            expect(storedReceipt.chargeRefNumber).toEqual(receipt.chargeRefNumber);
            expect(storedReceipt.processingDate).toEqual(receipt.processingDate);
        },
        20000,
    );
});

// Helper function to read streams
async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
}
