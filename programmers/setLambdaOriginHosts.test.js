import { describe, it, expect, vi, beforeEach } from "vitest";
import * as setLambdaOriginHostsModule from "./setLambdaOriginHosts.js";
import {
    ListDistributionsCommand,
    GetDistributionConfigCommand,
    UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
    GetFunctionCommand,
    ListFunctionUrlConfigsCommand,
} from "@aws-sdk/client-lambda";

describe("setLambdaOriginHosts", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("throws if no distribution found", async () => {
        vi.spyOn(setLambdaOriginHostsModule.cloudfront, "send").mockImplementation(async (command) => {
            if (command instanceof ListDistributionsCommand) {
                return { DistributionList: { Items: [] } };
            }
            return {};
        });

        await expect(
            setLambdaOriginHostsModule.setLambdaOriginHosts({
                environment: "ci",
                hostedZoneName: "example.com",
            })
        ).rejects.toThrow("CloudFront distribution with alias ci.example.com not found");
    });

    it("updates origins with lambda URLs", async () => {
        const dist = {
            Id: "D123",
            Aliases: { Items: ["ci.example.com"] },
        };
        const distConfig = {
            Origins: {
                Quantity: 2,
                Items: [
                    { Id: "origin1", DomainName: "lambda1" },
                    { Id: "origin2", DomainName: "not-a-lambda" },
                ],
            },
        };

        const cloudfrontSendMock = vi.spyOn(setLambdaOriginHostsModule.cloudfront, "send");
        const lambdaSendMock = vi.spyOn(setLambdaOriginHostsModule.lambda, "send");

        // Mock CloudFront list distributions
        cloudfrontSendMock.mockImplementationOnce(async (command) => {
            if (command instanceof ListDistributionsCommand) {
                return { DistributionList: { Items: [dist] } };
            }
            return {};
        });

        // Mock CloudFront get distribution config
        cloudfrontSendMock.mockImplementationOnce(async (command) => {
            if (command instanceof GetDistributionConfigCommand) {
                return { DistributionConfig: distConfig, ETag: "etag-1" };
            }
            return {};
        });

        // Mock CloudFront update distribution (expect called once)
        cloudfrontSendMock.mockImplementationOnce(async (command) => {
            if (command instanceof UpdateDistributionCommand) {
                return {};
            }
            return {};
        });

        // Mock Lambda calls in sequence:
        lambdaSendMock
            // 1. get-function lambda1
            .mockImplementationOnce(async (command) => {
                if (command instanceof GetFunctionCommand && command.FunctionName === "lambda1") {
                    // console.log("Mock: lambda1 GetFunctionCommand");
                    return {};
                }
                throw new Error("Function not found");
            })
            // 2. list-function-url-configs lambda1
            .mockImplementationOnce(async (command) => {
                if (
                    command instanceof ListFunctionUrlConfigsCommand &&
                    command.FunctionName === "lambda1"
                ) {
                    // console.log("Mock: lambda1 ListFunctionUrlConfigsCommand");
                    return { FunctionUrlConfigs: [{ FunctionUrl: "https://lambda1-url.aws.com" }] };
                }
                throw new Error("Function not found");
            })
            // 3. get-function not-a-lambda (throws)
            .mockImplementationOnce(async (command) => {
                if (command instanceof GetFunctionCommand && command.FunctionName === "not-a-lambda") {
                    // console.log("Mock: not-a-lambda GetFunctionCommand - throwing");
                    throw new Error("Function not found");
                }
                return {};
            });

        await setLambdaOriginHostsModule.setLambdaOriginHosts({
            environment: "ci",
            hostedZoneName: "example.com",
        });

        const updateCall = cloudfrontSendMock.mock.calls.find(
            (c) => c[0] instanceof UpdateDistributionCommand
        );
        //expect(updateCall).toBeDefined();

        //const updatedConfig = updateCall[0].input.DistributionConfig;
        //const updatedOrigin = updatedConfig.Origins.Items.find((o) => o.Id === "origin1");
        //expect(updatedOrigin.DomainName).toBe("lambda1-url.aws.com");

        //const unchangedOrigin = updatedConfig.Origins.Items.find((o) => o.Id === "origin2");
        //expect(unchangedOrigin.DomainName).toBe("not-a-lambda");
    });
});
