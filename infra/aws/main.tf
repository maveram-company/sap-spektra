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

variable "domain_name" {
  description = "Root domain name (e.g. spektra.maveram.com)"
  type        = string
  default     = "spektra.maveram.com"
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for the domain"
  type        = string
  default     = ""
}

variable "ecr_repository_url" {
  description = "ECR repository URL for API image"
  type        = string
  default     = ""
}

variable "api_image_tag" {
  description = "Docker image tag for the API"
  type        = string
  default     = "latest"
}

variable "api_cpu" {
  description = "Fargate task CPU units (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate task memory in MiB"
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 2
}

variable "api_max_count" {
  description = "Maximum number of API tasks for auto-scaling"
  type        = number
  default     = 6
}

variable "api_min_count" {
  description = "Minimum number of API tasks for auto-scaling"
  type        = number
  default     = 2
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "stripe_secret_key" {
  description = "Stripe API secret key"
  type        = string
  sensitive   = true
  default     = ""
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

# ── IAM Role for ECS Task Execution ──

resource "aws_iam_role" "ecs_task_execution" {
  name = "spektra-ecs-exec-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "spektra-ecs-task-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# ── Secrets Manager ──

resource "aws_secretsmanager_secret" "db_url" {
  name = "spektra-${var.environment}-db-url"
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://spektra:${var.db_password}@${aws_db_instance.spektra.endpoint}/spektra"
}

resource "aws_secretsmanager_secret" "db_password" {
  name = "spektra-${var.environment}-db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = var.db_password
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "spektra-${var.environment}-jwt-secret"
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "stripe_secret" {
  name = "spektra-${var.environment}-stripe-secret"
}

resource "aws_secretsmanager_secret_version" "stripe_secret" {
  secret_id     = aws_secretsmanager_secret.stripe_secret.id
  secret_string = var.stripe_secret_key
}

# ── IAM Policy: Allow ECS execution role to read secrets ──

resource "aws_iam_role_policy" "ecs_exec_secrets" {
  name = "spektra-ecs-secrets-${var.environment}"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
      ]
      Resource = [
        aws_secretsmanager_secret.db_url.arn,
        aws_secretsmanager_secret.db_password.arn,
        aws_secretsmanager_secret.jwt_secret.arn,
        aws_secretsmanager_secret.stripe_secret.arn,
      ]
    }]
  })
}

# ── ECS Task Definition ──

resource "aws_ecs_task_definition" "api" {
  family                   = "spektra-api-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "spektra-api"
    image = "${var.ecr_repository_url}:${var.api_image_tag}"

    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]

    environment = [
      { name = "PORT", value = "3001" },
      { name = "RUNTIME_MODE", value = "AWS_REAL" },
      { name = "NODE_ENV", value = var.environment == "production" ? "production" : "staging" },
      { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.spektra.cache_nodes[0].address}:6379" },
      { name = "COGNITO_REGION", value = var.aws_region },
      { name = "COGNITO_USER_POOL_ID", value = aws_cognito_user_pool.spektra.id },
      { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.spektra.id },
      { name = "SQS_QUEUE_URL", value = aws_sqs_queue.spektra.url },
      { name = "S3_BUCKET", value = aws_s3_bucket.spektra.id },
    ]

    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "STRIPE_SECRET_KEY", valueFrom = aws_secretsmanager_secret.stripe_secret.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3001/api/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = { Name = "spektra-api-${var.environment}" }
}

# ── Application Load Balancer ──

resource "aws_security_group" "alb" {
  name_prefix = "spektra-alb-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
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

resource "aws_lb" "api" {
  name               = "spektra-api-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  tags = { Name = "spektra-api-alb-${var.environment}" }
}

resource "aws_lb_target_group" "api" {
  name        = "spektra-api-${var.environment}"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
}

resource "aws_lb_listener" "api_http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "api_https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.spektra.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  depends_on = [aws_acm_certificate_validation.spektra]
}

# ── ECS Service ──

resource "aws_ecs_service" "api" {
  name            = "spektra-api"
  cluster         = aws_ecs_cluster.spektra.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "spektra-api"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener.api_https]

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = { Name = "spektra-api-${var.environment}" }
}

# ── ECS Auto-Scaling ──

resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.api_max_count
  min_capacity       = var.api_min_count
  resource_id        = "service/${aws_ecs_cluster.spektra.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "spektra-api-cpu-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "api_memory" {
  name               = "spektra-api-memory-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ── ACM Certificate ──

resource "aws_acm_certificate" "spektra" {
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "spektra-cert-${var.environment}" }
}

resource "aws_acm_certificate_validation" "spektra" {
  certificate_arn         = aws_acm_certificate.spektra.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ── S3 Bucket for Frontend ──

resource "aws_s3_bucket" "frontend" {
  bucket = "spektra-frontend-${var.environment}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── CloudFront Origin Access Identity ──

resource "aws_cloudfront_origin_access_identity" "frontend" {
  comment = "OAI for spektra-frontend-${var.environment}"
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = aws_cloudfront_origin_access_identity.frontend.iam_arn }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
}

# ── CloudFront Distribution ──

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = var.hosted_zone_id != "" ? [var.domain_name] : []
  price_class         = "PriceClass_100"

  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-frontend"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.frontend.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  # SPA fallback: serve index.html for 404s
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  viewer_certificate {
    acm_certificate_arn            = var.hosted_zone_id != "" ? aws_acm_certificate.spektra.arn : null
    cloudfront_default_certificate = var.hosted_zone_id == ""
    ssl_support_method             = var.hosted_zone_id != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  tags = { Name = "spektra-frontend-${var.environment}" }
}

# ── Route53 Records ──

resource "aws_route53_record" "cert_validation" {
  for_each = var.hosted_zone_id != "" ? {
    for dvo in aws_acm_certificate.spektra.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = var.hosted_zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60

  allow_overwrite = true
}

resource "aws_route53_record" "frontend" {
  count   = var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  count   = var.hosted_zone_id != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
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

output "ecs_service" {
  value = aws_ecs_service.api.name
}

output "alb_dns_name" {
  value = aws_lb.api.dns_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_bucket" {
  value = aws_s3_bucket.frontend.id
}

output "acm_certificate_arn" {
  value = aws_acm_certificate.spektra.arn
}
