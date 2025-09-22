package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrLogGroupName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrPublishRoleName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildEcrRepositoryName;
import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;

class DevStackTest {

    @Test
    void shouldCreateDevStackWithEcrAndLogging() {
        App app = new App();

        DevStack devStack = new DevStack(
                app,
                "TestDevStack",
                DevStack.DevStackProps.builder()
                        .env("test")
                        .hostedZoneName("diyaccounting.co.uk")
                        .subDomainName("submit")
                        .retainEcrRepository("false")
                        .build());

        assertNotNull(devStack, "DevStack should be created");
        assertNotNull(devStack.ecrRepository, "ECR Repository should be created");
        assertNotNull(devStack.ecrLogGroup, "ECR Log Group should be created");
        assertNotNull(devStack.ecrPublishRole, "ECR Publish Role should be created");

        // Verify resources exist (ARNs will contain CDK tokens during testing)
        assertNotNull(devStack.ecrRepository.getRepositoryArn(), "ECR Repository ARN should be set");
        assertNotNull(devStack.ecrRepository.getRepositoryUri(), "ECR Repository URI should be set");
        assertNotNull(devStack.ecrLogGroup.getLogGroupArn(), "ECR Log Group ARN should be set");
        assertNotNull(devStack.ecrPublishRole.getRoleArn(), "ECR Publish Role ARN should be set");
    }

    @Test
    void shouldBuildCorrectNamingPatterns() {
        // Test prod domain name
        String prodDomain = buildDomainName("prod", "submit", "diyaccounting.co.uk");
        assertEquals("submit.diyaccounting.co.uk", prodDomain);

        // Test non-prod domain name
        String devDomain = buildDomainName("dev", "submit", "diyaccounting.co.uk");
        assertEquals("dev.submit.diyaccounting.co.uk", devDomain);

        // Test dashed domain name
        String dashedDomain = buildDashedDomainName("dev", "submit", "diyaccounting.co.uk");
        assertEquals("dev-submit-diyaccounting-co-uk", dashedDomain);

        // Test ECR repository name
        String ecrName = buildEcrRepositoryName("dev-submit-diyaccounting-co-uk");
        assertEquals("dev-submit-diyaccounting-co-uk-ecr", ecrName);

        // Test ECR log group name
        String logGroupName = buildEcrLogGroupName("dev-submit-diyaccounting-co-uk");
        assertEquals("/aws/ecr/dev-submit-diyaccounting-co-uk", logGroupName);

        // Test ECR publish role name
        String roleName = buildEcrPublishRoleName("dev-submit-diyaccounting-co-uk");
        assertEquals("dev-submit-diyaccounting-co-uk-ecr-publish-role", roleName);
    }
}
