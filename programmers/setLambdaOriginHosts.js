import { CloudFrontClient, ListDistributionsCommand, GetDistributionConfigCommand, UpdateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { LambdaClient, GetFunctionCommand, ListFunctionUrlConfigsCommand } from "@aws-sdk/client-lambda";

export const cloudfront = new CloudFrontClient({});
export const lambda = new LambdaClient({});

async function findDistributionByAlias(domain) {
    const list = await cloudfront.send(new ListDistributionsCommand({}));
    if (!list.DistributionList || !list.DistributionList.Items) return null;

    return list.DistributionList.Items.find(dist =>
        dist.Aliases?.Items?.includes(domain)
    );
}

async function getLambdaUrlHost(functionName) {
    try {
        await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));

        const urls = await lambda.send(new ListFunctionUrlConfigsCommand({ FunctionName: functionName }));
        if (urls.FunctionUrlConfigs && urls.FunctionUrlConfigs.length > 0) {
            // Take the first URL
            const url = urls.FunctionUrlConfigs[0].FunctionUrl;
            const host = new URL(url).host;
            return host;
        }
    } catch (e) {
        // Lambda does not exist or no URL
        return null;
    }
    return null;
}

async function updateDistributionOrigins(distId, etag, distConfig, originUpdates) {
    // Replace origins matching keys in originUpdates
    const newOrigins = distConfig.Origins.Items.map(origin => {
        if (originUpdates[origin.DomainName]) {
            return { ...origin, DomainName: originUpdates[origin.DomainName] };
        }
        return origin;
    });

    distConfig.Origins.Items = newOrigins;
    distConfig.Origins.Quantity = newOrigins.length;

    const params = {
        Id: distId,
        IfMatch: etag,
        DistributionConfig: distConfig,
    };

    await cloudfront.send(new UpdateDistributionCommand(params));
}

export async function setLambdaOriginHosts(domain) {
    const dist = await findDistributionByAlias(domain);
    if (!dist) {
        throw new Error(`CloudFront distribution with alias ${domain} not found`);
    }

    const distConfigResponse = await cloudfront.send(new GetDistributionConfigCommand({ Id: dist.Id }));
    const distConfig = distConfigResponse.DistributionConfig;
    const etag = distConfigResponse.ETag;

    const originUpdates = {};
    for (const origin of distConfig.Origins.Items) {
        const lambdaHost = await getLambdaUrlHost(origin.DomainName);
        if (lambdaHost) {
            console.log(`Found Lambda URL for origin '${origin.DomainName}': ${lambdaHost}`);
            originUpdates[origin.DomainName] = lambdaHost;
        }
    }

    if (Object.keys(originUpdates).length === 0) {
        console.log("No origins matched Lambda functions with URLs. No update needed.");
        return;
    }

    await updateDistributionOrigins(dist.Id, etag, distConfig, originUpdates);
    console.log("CloudFront distribution origins updated successfully.");
}

// Allow script to be run directly via node
if (process.argv[1].endsWith("setLambdaOriginHosts.js")) {
    const domain = `CLOUDFRONT_ORIGIN_ALIAS`;
    setLambdaOriginHosts(domain)
        .then(() => console.log("Done"))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
