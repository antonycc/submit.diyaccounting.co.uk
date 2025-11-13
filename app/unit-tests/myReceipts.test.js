// app/unit-tests/myReceipts.test.js
import { describe, test, expect, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock AWS S3 client
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Mock = mockClient(S3Client);

// Import after mocks
import { handler as listReceipts, handler as getReceipt } from "@app/functions/hmrc/hmrcReceiptGet.js";

function makeJwt(sub = "test-user-sub") {
  const header = { alg: "none", typ: "JWT" };
  const payload = { sub };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64(header)}.${b64(payload)}.`;
}

describe("myReceipts functions", () => {
  beforeEach(() => {
    s3Mock.reset();
    process.env.DIY_SUBMIT_BASE_URL = "https://hmrc-test-redirect/"; // matches unit test expectation style
    process.env.DIY_SUBMIT_RECEIPTS_BUCKET_NAME = "test-receipts-bucket";
    process.env.TEST_S3_ENDPOINT = "http://localhost:9000"; // enable S3 client config
  });

  test("handle lists receipts sorted and parsed", async () => {
    const userSub = "abc123";
    const auth = `Bearer ${makeJwt(userSub)}`;
    const listResp = {
      Contents: [
        {
          Key: `receipts/${userSub}/2025-05-01T10:00:00.000Z-AAA.json`,
          Size: 123,
          LastModified: new Date("2025-05-01T10:00:10Z"),
        },
        {
          Key: `receipts/${userSub}/2025-06-01T09:00:00.000Z-BBB.json`,
          Size: 456,
          LastModified: new Date("2025-06-01T09:00:10Z"),
        },
      ],
      IsTruncated: false,
    };
    s3Mock.on(ListObjectsV2Command).resolves(listResp);

    const { statusCode, body } = await listReceipts({ headers: { authorization: auth } });
    expect(statusCode).toBe(200);
    const json = JSON.parse(body);
    expect(Array.isArray(json.receipts)).toBe(true);
    expect(json.receipts.length).toBe(2);
    // Sorted desc by timestamp
    expect(json.receipts[0].formBundleNumber).toBe("BBB");
    expect(json.receipts[1].formBundleNumber).toBe("AAA");
    expect(json.receipts[0].key).toContain(`receipts/${userSub}/`);
  });

  test("handle returns 401 when no auth", async () => {
    const { statusCode } = await listReceipts({ headers: {} });
    expect(statusCode).toBe(401);
  });

  test("handler fetches receipt by name and enforces prefix", async () => {
    const userSub = "xyz789";
    const auth = `Bearer ${makeJwt(userSub)}`;
    const receiptObj = { formBundleNumber: "CCC", processingDate: "2025-07-01T12:00:00Z" };

    const stream = new ReadableStreamMock(JSON.stringify(receiptObj));
    s3Mock.on(GetObjectCommand).resolves({ Body: stream });

    const { statusCode, body } = await getReceipt({
      headers: { authorization: auth },
      pathParameters: { name: "2025-07-01T12:00:00.000Z-CCC.json" },
    });
    expect(statusCode).toBe(200);
    const json = JSON.parse(body);
    expect(json.formBundleNumber).toBe("CCC");

    // Forbidden when trying to access someone else's prefix via full key
    const respForbidden = await getReceipt({
      headers: { authorization: auth },
      queryStringParameters: { key: `receipts/other/2025-01-01-XXX.json` },
    });
    expect(respForbidden.statusCode).toBe(403);
  });
});

// Minimal readable stream mock for Node <-> Vitest
class ReadableStreamMock {
  constructor(text) {
    this._text = text;
    this.readable = true;
  }
  on(event, handler) {
    if (event === "data") {
      handler(Buffer.from(this._text));
    } else if (event === "end") {
      setTimeout(handler, 0);
    } else if (event === "error") {
      // never errors in this simple mock
    }
  }
}
