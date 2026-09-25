terraform {
  required_version = ">= 1.6, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "park-sg", ManagedBy = "terraform" }
  }
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

variable "image_tag" {
  type        = string
  default     = "v1"
  description = "Immutable ECR image tag to deploy after pushing the container."
}

variable "enable_service" {
  type        = bool
  default     = false
  description = "Create ECR first, then set true once image_tag exists in ECR."
}

resource "aws_ecr_repository" "app" {
  name                 = "park-sg"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({ rules = [{ rulePriority = 1, description = "Expire untagged images after 7 days",
    selection = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 7 },
  action = { type = "expire" } }] })
}

resource "aws_iam_role" "image_access" {
  name = "park-sg-image-access"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "build.apprunner.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}

resource "aws_iam_role_policy" "image_access" {
  role = aws_iam_role.image_access.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:DescribeImages", "ecr:GetDownloadUrlForLayer"], Resource = aws_ecr_repository.app.arn }
  ] })
}

resource "aws_apprunner_auto_scaling_configuration_version" "app" {
  auto_scaling_configuration_name = "park-sg"
  min_size                        = 1
  max_size                        = 2
  max_concurrency                 = 100
}

resource "aws_apprunner_service" "app" {
  count                          = var.enable_service ? 1 : 0
  service_name                   = "park-sg"
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.app.arn
  source_configuration {
    auto_deployments_enabled = false
    authentication_configuration {
      access_role_arn = aws_iam_role.image_access.arn
    }
    image_repository {
      image_identifier      = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      image_repository_type = "ECR"
      image_configuration {
        port                          = "3000"
        runtime_environment_variables = { NODE_ENV = "production", PORT = "3000" }
      }
    }
  }
  instance_configuration {
    cpu    = "256"
    memory = "512"
  }
  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }
  depends_on = [aws_iam_role_policy.image_access]
}

resource "aws_cloudwatch_metric_alarm" "errors" {
  count               = var.enable_service ? 1 : 0
  alarm_name          = "park-sg-http-5xx"
  alarm_description   = "More than five server errors in five minutes. Attach an SNS action for notifications."
  namespace           = "AWS/AppRunner"
  metric_name         = "5xxStatusResponses"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    ServiceName = aws_apprunner_service.app[0].service_name
    ServiceID   = aws_apprunner_service.app[0].service_id
  }
}

output "repository_url" {
  value = aws_ecr_repository.app.repository_url
}
output "service_url" {
  value = var.enable_service ? "https://${aws_apprunner_service.app[0].service_url}" : null
}
