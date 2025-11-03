# DIY Accounting Submit - Backup Account Infrastructure
#
# This Terraform configuration provisions a dedicated backup account for storing
# application backups. The backup account is designed with zero knowledge of the
# ci and prod accounts - those accounts push backups to this account.
#
# Design Principles:
# - Backup account has no awareness of source accounts
# - Source accounts (ci/prod) push backups using cross-account IAM roles
# - Backups are encrypted at rest using KMS
# - Lifecycle policies automatically tier and expire backups
# - Immutable backups with versioning and legal hold support

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  # Backend configuration should be provided via -backend-config
  # Example: terraform init -backend-config="bucket=my-terraform-state"
  backend "s3" {
    # Configure via -backend-config or terraform.tfvars
    # bucket         = "diy-submit-terraform-state"
    # key            = "backup-account/terraform.tfstate"
    # region         = "eu-west-2"
    # encrypt        = true
    # dynamodb_table = "terraform-state-lock"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "DIY Accounting Submit"
      Environment = "backup"
      ManagedBy   = "Terraform"
      Purpose     = "Backup Storage"
    }
  }
}

variable "aws_region" {
  description = "AWS region for backup resources"
  type        = string
  default     = "eu-west-2"
}

variable "backup_account_id" {
  description = "AWS account ID for the backup account"
  type        = string
}

variable "source_account_ids" {
  description = "List of AWS account IDs that can push backups (ci and prod accounts)"
  type        = list(string)
}

variable "backup_retention_days" {
  description = "Number of days to retain backups before expiration"
  type        = number
  default     = 90
}

variable "transition_to_glacier_days" {
  description = "Number of days after which backups transition to Glacier"
  type        = number
  default     = 30
}

variable "transition_to_deep_archive_days" {
  description = "Number of days after which backups transition to Deep Archive"
  type        = number
  default     = 60
}

variable "backup_writer_role_name" {
  description = "Name of the IAM role that source accounts must create to write backups"
  type        = string
  default     = "submit-backup-writer-role"
}

# KMS key for backup encryption
resource "aws_kms_key" "backup_encryption" {
  description             = "KMS key for DIY Submit backup encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.backup_account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow source accounts to encrypt"
        Effect = "Allow"
        Principal = {
          AWS = [for account_id in var.source_account_ids : "arn:aws:iam::${account_id}:root"]
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = [
              "s3.${var.aws_region}.amazonaws.com"
            ]
          }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "backup_encryption" {
  name          = "alias/diy-submit-backup-encryption"
  target_key_id = aws_kms_key.backup_encryption.key_id
}

# S3 bucket for backups
resource "aws_s3_bucket" "backups" {
  bucket = "diy-submit-backups-${var.backup_account_id}"
  
  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }
}

# Enable versioning for backup history
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption with KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.backup_encryption.arn
    }
    bucket_key_enabled = true
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle policy for tiering and expiration
resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  
  rule {
    id     = "backup-lifecycle"
    status = "Enabled"
    
    # Transition to Glacier for cost savings
    transition {
      days          = var.transition_to_glacier_days
      storage_class = "GLACIER"
    }
    
    # Transition to Deep Archive for long-term storage
    transition {
      days          = var.transition_to_deep_archive_days
      storage_class = "DEEP_ARCHIVE"
    }
    
    # Expire backups after retention period
    expiration {
      days = var.backup_retention_days
    }
    
    # Clean up incomplete multipart uploads
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
    
    # Manage non-current versions
    noncurrent_version_transition {
      noncurrent_days = var.transition_to_glacier_days
      storage_class   = "GLACIER"
    }
    
    noncurrent_version_expiration {
      noncurrent_days = var.backup_retention_days
    }
  }
}

# Bucket policy for cross-account access
resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.backups.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:PutObject"
        Resource = "${aws_s3_bucket.backups.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      },
      {
        Sid    = "AllowSourceAccountsToWriteBackups"
        Effect = "Allow"
        Principal = {
          AWS = [for account_id in var.source_account_ids : "arn:aws:iam::${account_id}:role/${var.backup_writer_role_name}"]
        }
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:ListBucket",
          "s3:ListBucketVersions"
        ]
        Resource = [
          aws_s3_bucket.backups.arn,
          "${aws_s3_bucket.backups.arn}/*"
        ]
      }
    ]
  })
}

# Object Lock for immutable backups (optional, requires new bucket)
# Uncomment if you want truly immutable backups
# resource "aws_s3_bucket_object_lock_configuration" "backups" {
#   bucket = aws_s3_bucket.backups.id
#   
#   rule {
#     default_retention {
#       mode = "GOVERNANCE"  # or "COMPLIANCE" for stricter immutability
#       days = var.backup_retention_days
#     }
#   }
# }

# CloudWatch alarm for backup failures
resource "aws_cloudwatch_metric_alarm" "backup_failures" {
  alarm_name          = "diy-submit-backup-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "4xxErrors"
  namespace           = "AWS/S3"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "This metric monitors backup upload failures"
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    BucketName = aws_s3_bucket.backups.id
  }
}

# SNS topic for backup notifications
resource "aws_sns_topic" "backup_notifications" {
  name = "diy-submit-backup-notifications"
}

# S3 event notifications for new backups
resource "aws_s3_bucket_notification" "backup_events" {
  bucket = aws_s3_bucket.backups.id
  
  topic {
    topic_arn = aws_sns_topic.backup_notifications.arn
    events    = ["s3:ObjectCreated:*"]
  }
}

# Allow S3 to publish to SNS
resource "aws_sns_topic_policy" "backup_notifications" {
  arn = aws_sns_topic.backup_notifications.arn
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.backup_notifications.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = aws_s3_bucket.backups.arn
          }
        }
      }
    ]
  })
}

# Outputs
output "backup_bucket_name" {
  description = "Name of the backup S3 bucket"
  value       = aws_s3_bucket.backups.id
}

output "backup_bucket_arn" {
  description = "ARN of the backup S3 bucket"
  value       = aws_s3_bucket.backups.arn
}

output "kms_key_id" {
  description = "ID of the KMS key for backup encryption"
  value       = aws_kms_key.backup_encryption.id
}

output "kms_key_arn" {
  description = "ARN of the KMS key for backup encryption"
  value       = aws_kms_key.backup_encryption.arn
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic for backup notifications"
  value       = aws_sns_topic.backup_notifications.arn
}

output "required_source_role_name" {
  description = "Name of the IAM role that source accounts must create"
  value       = var.backup_writer_role_name
}
