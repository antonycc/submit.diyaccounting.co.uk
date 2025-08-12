package co.uk.diyaccounting.submit.constructs;

import software.amazon.awscdk.services.lambda.FunctionUrlAuthType;

public class LambdaUrlOriginOpts {
    public final String env;
    public final String imageDirectory;
    public final FunctionUrlAuthType functionUrlAuthType;
    public final boolean cloudTrailEnabled;
    public final boolean xRayEnabled;
    public final boolean verboseLogging;
    public final String baseImageTag;

    private LambdaUrlOriginOpts(Builder b) {
        this.env = b.env;
        this.imageDirectory = b.imageDirectory;
        this.functionUrlAuthType = b.functionUrlAuthType;
        this.cloudTrailEnabled = b.cloudTrailEnabled;
        this.xRayEnabled = b.xRayEnabled;
        this.verboseLogging = b.verboseLogging;
        this.baseImageTag = b.baseImageTag;
    }

    public static class Builder {
        private String env;
        private String imageDirectory = ".";
        private FunctionUrlAuthType functionUrlAuthType = FunctionUrlAuthType.NONE;
        private boolean cloudTrailEnabled = false;
        private boolean xRayEnabled = false;
        private boolean verboseLogging = false;
        private String baseImageTag;

        public static Builder create() { return new Builder(); }

        public Builder env(String env) { this.env = env; return this; }
        public Builder imageDirectory(String imageDirectory) { this.imageDirectory = imageDirectory; return this; }
        public Builder functionUrlAuthType(FunctionUrlAuthType functionUrlAuthType) { this.functionUrlAuthType = functionUrlAuthType; return this; }
        public Builder cloudTrailEnabled(boolean cloudTrailEnabled) { this.cloudTrailEnabled = cloudTrailEnabled; return this; }
        public Builder xRayEnabled(boolean xRayEnabled) { this.xRayEnabled = xRayEnabled; return this; }
        public Builder verboseLogging(boolean verboseLogging) { this.verboseLogging = verboseLogging; return this; }
        public Builder baseImageTag(String baseImageTag) { this.baseImageTag = baseImageTag; return this; }

        public LambdaUrlOriginOpts build() { return new LambdaUrlOriginOpts(this); }
    }
}