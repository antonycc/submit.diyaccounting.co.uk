import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logReceiptHandler } from './src/lib/main.js';

const s3Mock = mockClient(S3Client);

// Set up environment
process.env.RECEIPTS_BUCKET = 'test-bucket';

// Set up mock
let store = new Map();
s3Mock.reset();
s3Mock.on(PutObjectCommand).callsFake(input => {
    console.log('Mock PutObjectCommand called with:', input);
    const { Key, Body } = input;
    store.set(Key, Body);
    return Promise.resolve({});
});

// Test receipt data
const testReceipt = {
    formBundleNumber: 'TEST-FB-123',
    chargeRefNumber: 'TEST-CR-123',
    processingDate: new Date().toISOString()
};

console.log('Testing logReceiptHandler with S3 mock...');
console.log('Input receipt:', testReceipt);

try {
    const result = await logReceiptHandler({ 
        body: JSON.stringify(testReceipt) 
    });

    console.log('Result:', result);
    console.log('Result body:', result.body);

    if (result.body) {
        try {
            const parsed = JSON.parse(result.body);
            console.log('Parsed body:', parsed);
            console.log('Status:', parsed.status);
        } catch (e) {
            console.log('Error parsing body:', e.message);
        }
    }

    console.log('Store contents:', Array.from(store.entries()));
} catch (error) {
    console.log('Error calling logReceiptHandler:', error);
}
