# API Gateway Setup Guide - ECS Infrastructure Control

A complete guide for managing ECS infrastructure through API Gateway endpoints.

---

## Quick Reference

| Endpoint | Method | Lambda Function | Description |
|----------|--------|-----------------|-------------|
| `/create` | POST | ECS-Darkmap-infrastructure | Creates ECS services, ALBs, Target Groups |
| `/delete` | POST | Delete-ECS-Darkmap-infrastructure | Deletes all ECS infrastructure |
| `/start-services` | POST | (existing) | Scales ECS services up |

**Base URL:** `https://3n9j098tbf.execute-api.us-east-1.amazonaws.com/prod`

---

## API Endpoints Details

### 1. Create Infrastructure (`POST /create`)

**Purpose:** Creates ECS services with ALBs for channel scraping.

**Request:**
```bash
POST https://3n9j098tbf.execute-api.us-east-1.amazonaws.com/prod/create
```

**Response Example:**
```json
{
  "status": "success",
  "message": "🚀 Creating ECS Infrastructure...",
  "details": "Stack operations initiated. Creating: 5, Updating: 0, Skipped: 0",
  "stacks_creating": [
    "ECS-Service-Generic1",
    "ECS-Service-Generic2",
    "ECS-Service-Generic3",
    "ECS-Service-Generic4",
    "ECS-Service-Generic5"
  ],
  "stacks_updating": [],
  "stacks_skipped": [],
  "existing_services": 0,
  "note": "Stack creation takes 5-7 minutes. Check CloudFormation console for progress."
}
```

**What it creates (per service):**
- Application Load Balancer (ALB)
- Target Group
- Listener on port 5000
- ECS Service with Fargate tasks

**Time to complete:** 5-7 minutes (runs in background)

---

### 2. Delete Infrastructure (`POST /delete`)

**Purpose:** Removes all ECS infrastructure to save costs when not in use.

**Request:**
```bash
POST https://3n9j098tbf.execute-api.us-east-1.amazonaws.com/prod/delete
```

**Response Example:**
```json
{
  "status": "success",
  "message": "🗑️ Deleting ECS Infrastructure...",
  "details": "Deletion initiated for 5 stacks. This process takes 2-5 minutes to complete.",
  "stacks_deleting": [
    "ECS-Service-Generic1",
    "ECS-Service-Generic2",
    "ECS-Service-Generic3",
    "ECS-Service-Generic4",
    "ECS-Service-Generic5"
  ],
  "stacks_skipped": []
}
```

**What it deletes:**
- All ALBs (Service-Generic1-ELB through Service-Generic5-ELB)
- All Target Groups
- All ECS Services

**Time to complete:** 2-5 minutes (runs in background)

---

### 3. Query Scraped Channels (`POST /query` or ECS-Service-Controller)

**Purpose:** Queries all ECS services to find Telegram channels based on search query.

**Request:**
```bash
POST https://3n9j098tbf.execute-api.us-east-1.amazonaws.com/prod/query
Content-Type: application/json

{
  "search_query": "database leak"
}
```

**Response Example:**
```json
{
  "channel_names": [
    "darknetleaks",
    "database_dump",
    "hackersclub",
    ...
  ]
}
```

---

## Setup Instructions

### Step 1: Open Your Existing API Gateway

1. Go to **AWS Console** → **API Gateway**
2. Click on **`start-services`** API (ID: `3n9j098tbf`)

---

### Step 2: Create "Create Infrastructure" Route

#### 2.1 Create the Resource
1. In left sidebar, click **Resources**
2. Click **Create Resource**
3. Enter:
   - Resource Name: `create`
   - Resource Path: `/create`
4. Click **Create Resource**

#### 2.2 Create the Method
1. Select the `/create` resource
2. Click **Create Method**
3. Configure:
   - Method type: **POST**
   - Integration type: **Lambda Function**
   - Lambda proxy integration: ✅ **Enable**
   - Lambda function: **ECS-Darkmap-infrastructure**
4. Click **Create Method**

#### 2.3 Grant Lambda Permission
- When prompted "Add Permission to Lambda Function", click **OK**

---

### Step 3: Create "Delete Infrastructure" Route

#### 3.1 Create the Resource
1. Click **Create Resource**
2. Enter:
   - Resource Name: `delete`
   - Resource Path: `/delete`
3. Click **Create Resource**

#### 3.2 Create the Method
1. Select the `/delete` resource
2. Click **Create Method**
3. Configure:
   - Method type: **POST**
   - Integration type: **Lambda Function**
   - Lambda proxy integration: ✅ **Enable**
   - Lambda function: **Delete-ECS-Darkmap-infrastructure**
4. Click **Create Method**

---

### Step 4: Deploy the API

1. Click **Deploy API** button (top right)
2. Select Stage: **prod**
3. Click **Deploy**

---

## Testing with Postman

### Create Infrastructure:
1. Method: **POST**
2. URL: `https://3n9j098tbf.execute-api.us-east-1.amazonaws.com/prod/create`
3. No body required
4. Click **Send**
5. ✅ Should receive instant response with stack creation status

### Delete Infrastructure:
1. Method: **POST**
2. URL: `https://3n9j098tbf.execute-api.us-east-1.amazonaws.com/prod/delete`
3. No body required
4. Click **Send**
5. ✅ Should receive instant response with deletion status

### Query Channels:
1. Method: **POST**
2. URL: `https://3n9j098tbf.execute-api.us-east-1.amazonaws.com/prod/query`
3. Body (JSON): `{"search_query": "your search term"}`
4. Click **Send**

---

## Dashboard Integration

| Button | API Endpoint | Expected Response |
|--------|--------------|-------------------|
| 🟢 **Start Infrastructure** | `POST /create` | Instant response, stacks create in 5-7 min |
| �️ **Stop Infrastructure** | `POST /delete` | Instant response, stacks delete in 2-5 min |
| � **Search Channels** | `POST /query` | Returns channel names |

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `Internal server error` | Old Lambda code deployed | Upload latest lambda_function.py |
| Empty response from query | ECS services not running | Wait for stacks to complete, check CloudFormation |
| 403 Forbidden | API Gateway permissions | Re-deploy API Gateway |
| Stacks in ROLLBACK_COMPLETE | Task definition inactive | Create new task definition revision |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Gateway                              │
│  POST /create  │  POST /delete  │  POST /query                  │
└───────┬────────┴───────┬────────┴───────┬──────────────────────┘
        │                │                │
        ▼                ▼                ▼
┌───────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│ ECS-Darkmap-  │ │ Delete-ECS-     │ │ ECS-Service-        │
│ infrastructure│ │ Darkmap-infra   │ │ Controller          │
└───────┬───────┘ └───────┬─────────┘ └──────────┬──────────┘
        │                 │                      │
        ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CloudFormation                             │
│  Creates/Deletes: ALBs, Target Groups, ECS Services             │
└───────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ECS Cluster                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ Generic1 │ │ Generic2 │ │ Generic3 │ │ Generic4 │ │ Generic5 ││
│  │ (dork1)  │ │ (dork2)  │ │ (dork3)  │ │ (dork4)  │ │ (dork5)  ││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘│
└───────┼────────────┼────────────┼────────────┼────────────┼──────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Load Balancers                    │
│  Service-Generic1-ELB → Service-Generic5-ELB                    │
│  Each on port 5000 with /api/retrieve-channel-names endpoint    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Lambda Functions Reference

| Lambda Function | Purpose | Timeout |
|-----------------|---------|---------|
| `ECS-Darkmap-infrastructure` | Creates CloudFormation stacks for ECS services | 5 min |
| `Delete-ECS-Darkmap-infrastructure` | Deletes CloudFormation stacks | 1 min |
| `ECS-Service-Controller` | Queries all ECS services for channel names | 30 sec |

---

## Files to Update When Making Changes

| File | Location | Purpose |
|------|----------|---------|
| `lambda_function.py` | ECS-Darkmap-infrastructure/ | Create infrastructure logic |
| `lambda_function.py` | Delete-ECS-Darkmap-infrastructure/ | Delete infrastructure logic |
| `index.py` | ECS-Service-Controller/ | Query aggregation logic |
| `Generic1-5.json` | ECS-Darkmap-infrastructure/ | CloudFormation templates |
