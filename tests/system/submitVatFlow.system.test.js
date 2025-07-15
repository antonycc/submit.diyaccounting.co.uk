// tests/system/submitVatFlow.system.test.js

import { describe, beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { GenericContainer } from 'testcontainers';
import {
    S3Client, PutObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

import {
    exchangeTokenHandler,
    submitVatHandler,
    logReceiptHandler,
} from '@src/lib/main.js';

const HMRC = 'https://api.service.hmrc.gov.uk';

const server = setupServer(
    http.post(`${HMRC}/oauth/token`, () =>
        HttpResponse.json({ access_token: 'test-access-token' })
    ),
    http.post(`${HMRC}/organisations/vat/:vrn/returns`, ({ params }) => {
        const { vrn } = params;
        return HttpResponse.json({
            formBundleNumber: `${vrn}-bundle`,
            chargeRefNumber: `${vrn}-charge`,
            processingDate: new Date().toISOString(),
        });
    }),
);

describe('System Test – submit VAT and persist receipts to containerised S3', () => {
    let container;
    let s3Client;
    const BUCKET_NAME = 'test-receipts';

    beforeAll(async () => {
        server.listen({ onUnhandledRequest: 'error' });

        container = await new GenericContainer('minio/minio')
            .withExposedPorts(9000)
            .withEnv('MINIO_ROOT_USER', 'minioadmin')
            .withEnv('MINIO_ROOT_PASSWORD', 'minioadmin')
            .withCommand(['server', '/data'])
            .start();

        const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;

        s3Client = new S3Client({
            endpoint,
            region: 'us-east-1',
            credentials: {
                accessKeyId: 'minioadmin',
                secretAccessKey: 'minioadmin',
            },
            forcePathStyle: true,
        });

        // Create bucket
        await fetch(`${endpoint}/${BUCKET_NAME}`, { method: 'PUT' });

        // Mock the environment variables for the handlers
        process.env.RECEIPTS_BUCKET = BUCKET_NAME;
        process.env.S3_ENDPOINT = endpoint;
        process.env.S3_ACCESS_KEY = 'minioadmin';
        process.env.S3_SECRET_KEY = 'minioadmin';
    }, 20000); // 20s timeout to accommodate container startup

    afterAll(async () => {
        await container.stop();
        server.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('full flow: exchange token, submit VAT, log receipt and retrieve from S3', async () => {
        // Exchange token
        const exchangeRes = await exchangeTokenHandler({
            body: JSON.stringify({ code: 'dummy-code' }),
        });
        const { accessToken } = JSON.parse(exchangeRes.body);
        expect(accessToken).toBe('test-access-token');

        // Submit VAT
        const vatPayload = {
            vatNumber: '111222333',
            periodKey: '24A1',
            vatDue: '1000.00',
            accessToken,
        };

        const submitRes = await submitVatHandler({ body: JSON.stringify(vatPayload) });
        const receipt = JSON.parse(submitRes.body);
        expect(receipt.formBundleNumber).toBe('111222333-bundle');

        // Log receipt (S3 putObject via handler)
        const logRes = await logReceiptHandler({ body: JSON.stringify(receipt) });
        expect(JSON.parse(logRes.body).status).toBe('receipt logged');

        // Retrieve the stored receipt directly from the containerized S3
        const getObjectOutput = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: `receipts/${receipt.formBundleNumber}.json`,
        }));

        const receiptFromS3 = await streamToString(getObjectOutput.Body);

        const storedReceipt = JSON.parse(receiptFromS3);

        // Assertions
        expect(storedReceipt.formBundleNumber).toEqual(receipt.formBundleNumber);
        expect(storedReceipt.chargeRefNumber).toEqual(receipt.chargeRefNumber);
        expect(storedReceipt.processingDate).toEqual(receipt.processingDate);
    }, 20000);
});

// Helper function to read streams
async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}
