# ══════════════════════════════════════════════════════════
# SAP Spektra — AWS Infrastructure (Terraform)
# ══════════════════════════════════════════════════════════
#
# This is a FOUNDATION template. It provisions the core
# infrastructure needed to run Spektra in AWS_REAL mode.
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Terraform >= 1.5
#   - An existing Route53 hosted zone (optional, for custom domain)

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment for remote state
  # backend "s3" {
  #   bucket = "spektra-terraform-state"
  #   key    = "infra/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "sap-spektra"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ── Variables ──

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

# ── VPC ──

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "spektra-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.11.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = { Name = "spektra-${var.environment}" }
}

# ── RDS PostgreSQL ──

resource "aws_db_subnet_group" "spektra" {
  name       = "spektra-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "rds" {
  name_prefix = "spektra-rds-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}

resource "aws_db_instance" "spektra" {
  identifier     = "spektra-${var.environment}"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_encrypted     = true

  db_name  = "spektra"
  username = "spektra"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.spektra.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 7
  skip_final_snapshot     = var.environment != "production"

  tags = { Name = "spektra-db-${var.environment}" }
}

# ── ElastiCache Redis ──

resource "aws_elasticache_subnet_group" "spektra" {
  name       = "spektra-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name_prefix = "spektra-redis-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}

resource "aws_elasticache_cluster" "spektra" {
  cluster_id           = "spektra-${var.environment}"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.spektra.name
  security_group_ids   = [aws_security_group.redis.id]
}

# ── ECS / Fargate (API) ──

resource "aws_security_group" "api" {
  name_prefix = "spektra-api-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_ecs_cluster" "spektra" {
  name = "spektra-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/spektra-api-${var.environment}"
  retention_in_days = 30
}

# ── Cognito User Pool ──

resource "aws_cognito_user_pool" "spektra" {
  name = "spektra-${var.environment}"

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  auto_verified_attributes = ["email"]

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
}

resource "aws_cognito_user_pool_client" "spektra" {
  name         = "spektra-api-${var.environment}"
  user_pool_id = aws_cognito_user_pool.spektra.id

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
}

# ── S3 Bucket (backups, exports) ──

resource "aws_s3_bucket" "spektra" {
  bucket = "spektra-${var.environment}-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "spektra" {
  bucket = aws_s3_bucket.spektra.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "spektra" {
  bucket = aws_s3_bucket.spektra.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "spektra" {
  bucket                  = aws_s3_bucket.spektra.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── SQS Queue ──

resource "aws_sqs_queue" "spektra" {
  name                       = "spektra-events-${var.environment}"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 86400
}

# ── EventBridge ──

resource "aws_cloudwatch_event_bus" "spektra" {
  name = "spektra-${var.environment}"
}

# ── Data Sources ──

data "aws_caller_identity" "current" {}

# ── Outputs ──

output "database_endpoint" {
  value     = aws_db_instance.spektra.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.spektra.cache_nodes[0].address
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.spektra.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.spektra.id
}

output "s3_bucket" {
  value = aws_s3_bucket.spektra.id
}

output "sqs_queue_url" {
  value = aws_sqs_queue.spektra.url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.spektra.name
}
