#!/bin/bash
# scripts/manage-runtime-config.sh
# 
# Script to manage runtime configuration parameters for DIY Submit
# Requires AWS CLI to be configured with appropriate permissions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default AWS region
AWS_REGION="${AWS_REGION:-eu-west-2}"

# Parameter names
BUNDLE_MOCK_PARAM="/diy-submit/bundle-mock"
AUTH_MOCK_PARAM="/diy-submit/auth-mock"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Usage: $0 <command> [options]

Commands:
    status              Show current runtime configuration
    enable-bundle-mock  Enable bundle mock mode
    disable-bundle-mock Disable bundle mock mode
    enable-auth-mock    Enable authentication mock mode
    disable-auth-mock   Disable authentication mock mode
    enable-all-mock     Enable all mock modes
    disable-all-mock    Disable all mock modes

Options:
    --region REGION     AWS region (default: eu-west-2)
    --help              Show this help message

Examples:
    $0 status
    $0 enable-bundle-mock
    $0 disable-all-mock
    $0 status --region us-east-1

Environment Variables:
    AWS_REGION          AWS region to use (default: eu-west-2)
    AWS_PROFILE         AWS profile to use
EOF
}

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

get_parameter() {
    local param_name="$1"
    local value
    value=$(aws ssm get-parameter --name "$param_name" --region "$AWS_REGION" --query 'Parameter.Value' --output text 2>/dev/null || echo "NOT_FOUND")
    echo "$value"
}

set_parameter() {
    local param_name="$1"
    local param_value="$2"
    local description="$3"
    
    if ! aws ssm put-parameter --name "$param_name" --value "$param_value" --description "$description" --type String --overwrite --region "$AWS_REGION" >/dev/null 2>&1; then
        error "Failed to set parameter $param_name"
    fi
    log "Set $param_name = $param_value"
}

show_status() {
    log "Current runtime configuration:"
    echo
    
    local bundle_mock
    local auth_mock
    
    bundle_mock=$(get_parameter "$BUNDLE_MOCK_PARAM")
    auth_mock=$(get_parameter "$AUTH_MOCK_PARAM")
    
    printf "  %-25s %s\n" "Bundle Mock Mode:" "$([ "$bundle_mock" = "true" ] && echo -e "${GREEN}ENABLED${NC}" || echo -e "${RED}DISABLED${NC}")"
    printf "  %-25s %s\n" "Auth Mock Mode:" "$([ "$auth_mock" = "true" ] && echo -e "${GREEN}ENABLED${NC}" || echo -e "${RED}DISABLED${NC}")"
    
    echo
    if [ "$bundle_mock" = "NOT_FOUND" ] || [ "$auth_mock" = "NOT_FOUND" ]; then
        warn "Some parameters not found. This may be normal if the stack hasn't been deployed yet."
        echo "       Parameters are created automatically during CDK deployment."
    fi
    
    echo "  AWS Region: $AWS_REGION"
    echo "  Lambda functions will pick up changes on next invocation (within ~30 seconds due to caching)"
}

enable_bundle_mock() {
    set_parameter "$BUNDLE_MOCK_PARAM" "true" "Runtime switch for bundle mock mode (true/false)"
    log "Bundle mock mode enabled. Lambda functions will use in-memory storage instead of AWS Cognito."
}

disable_bundle_mock() {
    set_parameter "$BUNDLE_MOCK_PARAM" "false" "Runtime switch for bundle mock mode (true/false)"
    log "Bundle mock mode disabled. Lambda functions will use AWS Cognito for bundle management."
}

enable_auth_mock() {
    set_parameter "$AUTH_MOCK_PARAM" "true" "Runtime switch for authentication mock mode (true/false)"
    log "Auth mock mode enabled. Lambda functions will redirect to mock OAuth2 server."
}

disable_auth_mock() {
    set_parameter "$AUTH_MOCK_PARAM" "false" "Runtime switch for authentication mock mode (true/false)"
    log "Auth mock mode disabled. Lambda functions will use real authentication providers."
}

enable_all_mock() {
    enable_bundle_mock
    enable_auth_mock
    log "All mock modes enabled."
}

disable_all_mock() {
    disable_bundle_mock
    disable_auth_mock
    log "All mock modes disabled."
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        --help)
            usage
            exit 0
            ;;
        status)
            COMMAND="status"
            shift
            ;;
        enable-bundle-mock)
            COMMAND="enable-bundle-mock"
            shift
            ;;
        disable-bundle-mock)
            COMMAND="disable-bundle-mock"
            shift
            ;;
        enable-auth-mock)
            COMMAND="enable-auth-mock"
            shift
            ;;
        disable-auth-mock)
            COMMAND="disable-auth-mock"
            shift
            ;;
        enable-all-mock)
            COMMAND="enable-all-mock"
            shift
            ;;
        disable-all-mock)
            COMMAND="disable-all-mock"
            shift
            ;;
        *)
            error "Unknown option: $1. Use --help for usage information."
            ;;
    esac
done

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    error "AWS CLI is not installed or not in PATH. Please install AWS CLI first."
fi

# Check AWS credentials
if ! aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
    error "AWS credentials not configured or invalid. Please run 'aws configure' first."
fi

# Execute command
case "$COMMAND" in
    status)
        show_status
        ;;
    enable-bundle-mock)
        enable_bundle_mock
        ;;
    disable-bundle-mock)
        disable_bundle_mock
        ;;
    enable-auth-mock)
        enable_auth_mock
        ;;
    disable-auth-mock)
        disable_auth_mock
        ;;
    enable-all-mock)
        enable_all_mock
        ;;
    disable-all-mock)
        disable_all_mock
        ;;
    *)
        usage
        exit 1
        ;;
esac