# DarkMap ECS Infrastructure Documentation

## Overview

This folder contains AWS Lambda functions for managing ECS infrastructure on-demand. The system allows dynamic creation and deletion of ECS services with their associated load balancers.

---

## Prerequisites (Must Exist Before Running)

| Resource | Name | Managed By |
|----------|------|------------|
| ECS Cluster | `ECS-DarkMap` | Manual / Separate IaC |
| Task Definitions | `Generic1` through `Generic5` | Manual / Separate IaC |
| VPC | `vpc-055e0fb33099720e4` | Manual |
| Subnets | 6 subnets across availability zones | Manual |
| Security Group | `sg-0908175731368b263` | Manual |

---

## Lambda Functions

### 1. ECS-Darkmap-infrastructure (CREATE)

**Purpose:** Creates ECS services and ALBs via CloudFormation

**Location:** `ECS-Darkmap-infrastructure/lambda_function.py`

**Creates:**
- ✅ 5 ECS Services (`Generic1` through `Generic5`) - 2 Fargate tasks each
- ✅ 5 Application Load Balancers (`Service-Generic1-ELB` through `Service-Generic5-ELB`)
- ✅ 5 Target Groups
- ✅ 5 Listeners (port 5000)

**CloudFormation Stacks Created:**
- `ECS-Service-Generic1`
- `ECS-Service-Generic2`
- `ECS-Service-Generic3`
- `ECS-Service-Generic4`
- `ECS-Service-Generic5`

**Post-Creation Action:**
Updates the Controller Lambda (`ECS-Service-Controller-MyLambdaFunction-4dOCutIT76KM`) with `API_URLS` environment variable containing all ALB DNS endpoints.

---

### 2. Delete-ECS-Darkmap-infrastructure (DELETE)

**Purpose:** Deletes all CloudFormation stacks created by the CREATE function

**Location:** `Delete-ECS-Darkmap-infrastructure/lambda_function.py`

**Deletes:**
- ❌ 5 ECS Services (`Generic1` through `Generic5`)
- ❌ 5 Application Load Balancers
- ❌ 5 Target Groups
- ❌ 5 Listeners

**Does NOT Delete:**
- ECS Cluster (`ECS-DarkMap`)
- Task Definitions
- VPC/Subnets/Security Groups
- Other services (e.g., `advance-query-service`, `financial-fraud-service`)

---

### 3. ECS-cluster-services (SCALE)

**Purpose:** Scales ECS services to 3 tasks each

**Location:** `ECS-cluster-services/lambda_function.py`

**Action:**
- Updates `desiredCount` from 2 → 3 for all Generic services
- Uses parallel execution (ThreadPoolExecutor) for faster scaling

---

## Traffic Flow

```
Client Request
      ↓
ALB (Service-GenericX-ELB) : Port 5000
      ↓
Listener (Port 5000)
      ↓
Target Group (ecs-Service-GenericX)
      ↓
ECS Fargate Tasks (Port 5000)
      ↓
/api/retrieve-telegram-messages
```

---

## Operational Workflow

```
1. SPIN UP INFRASTRUCTURE
   └── Run: ECS-Darkmap-infrastructure Lambda
       └── Creates 5 services + 5 ALBs
       └── Traffic starts flowing

2. (OPTIONAL) SCALE UP
   └── Run: ECS-cluster-services Lambda
       └── Increases capacity (2 → 3 tasks per service)

3. TEAR DOWN INFRASTRUCTURE
   └── Run: Delete-ECS-Darkmap-infrastructure Lambda
       └── Removes all services + ALBs
       └── Cluster remains intact for next spin-up
```

---

## Resource Lifecycle Summary

| Resource | Created By | Deleted By | Permanent? |
|----------|------------|------------|------------|
| ECS Cluster | Manual | Manual | ✅ Yes |
| Task Definitions | Manual | Manual | ✅ Yes |
| VPC/Subnets/SG | Manual | Manual | ✅ Yes |
| Generic1-5 Services | CREATE Lambda | DELETE Lambda | ❌ No |
| 5 ALBs | CREATE Lambda | DELETE Lambda | ❌ No |
| Target Groups | CREATE Lambda | DELETE Lambda | ❌ No |
| Listeners | CREATE Lambda | DELETE Lambda | ❌ No |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `Generic1.json` - `Generic5.json` | CloudFormation templates for each service |

Each template defines:
- ECS Service configuration
- Load Balancer settings
- Target Group configuration
- Listener rules

---

## API Gateway Integration

For dashboard control of infrastructure, see: [API-GATEWAY-SETUP-GUIDE.md](./API-GATEWAY-SETUP-GUIDE.md)
