# Delete Lambda Deployment Guide

## Issue: 502 Bad Gateway Error

The 502 error means API Gateway cannot reach the Lambda or the Lambda is crashing.

---

## Root Cause Analysis

**Possible causes:**
1. ❌ **Lambda code not uploaded** - Still running old code
2. ❌ **Lambda timeout too short** - Set to < 10 seconds
3. ❌ **Lambda runtime error** - Code has a bug
4. ❌ **IAM permissions missing** - Can't delete CloudFormation stacks

---

## Solution Steps

### Step 1: Check Lambda Exists
1. Go to **AWS Console** → **Lambda**
2. Search for: `Delete-ECS-Darkmap-infrastructure`
3. ✅ If it exists, proceed to Step 2
4. ❌ If it doesn't exist, create it first

---

### Step 2: Upload New Code

#### Option A: Via AWS Console (Recommended)
1. Open `Delete-ECS-Darkmap-infrastructure` Lambda
2. Click **Code** tab
3. Delete all existing code
4. Copy-paste the entire content from `lambda_function.py`
5. Click **Deploy** button
6. Wait for "Successfully updated" message

#### Option B: Via ZIP Upload
1. Create a file called `lambda_function.py` with the code
2. Zip it: `lambda_function.zip`
3. Upload via Lambda console

---

### Step 3: Configure Lambda Settings

1. Click **Configuration** tab
2. Click **General configuration** → **Edit**
3. Set:
   - **Timeout:** `30 seconds` (was probably 3 seconds)
   - **Memory:** `256 MB`
4. Click **Save**

---

### Step 4: Verify IAM Permissions

1. Click **Configuration** → **Permissions**
2. Click on the **Execution role** link
3. Verify it has these permissions:
   ```json
   {
     "Effect": "Allow",
     "Action": [
       "cloudformation:DeleteStack",
       "cloudformation:DescribeStacks",
       "logs:CreateLogGroup",
       "logs:CreateLogStream",
       "logs:PutLogEvents"
     ],
     "Resource": "*"
   }
   ```

---

### Step 5: Test Lambda Directly

1. In Lambda console, click **Test** tab
2. Create test event:
   ```json
   {}
   ```
3. Click **Test**
4. ✅ Should see: "Execution result: succeeded"
5. Check response body for deletion status

---

### Step 6: Check CloudWatch Logs

If still failing:
1. Go to **CloudWatch** → **Log groups**
2. Find: `/aws/lambda/Delete-ECS-Darkmap-infrastructure`
3. Click latest log stream
4. Look for error messages

---

## Expected Response After Fix

```json
{
  "statusCode": 200,
  "body": {
    "status": "success",
    "message": "🗑️ Deleting ECS Infrastructure...",
    "details": "Deletion initiated for 5 stacks.",
    "stacks_deleting": [
      "ECS-Service-Generic1",
      "ECS-Service-Generic2",
      "ECS-Service-Generic3",
      "ECS-Service-Generic4",
      "ECS-Service-Generic5"
    ]
  }
}
```

---

## Quick Checklist

- [ ] Lambda function exists
- [ ] New code uploaded and deployed
- [ ] Timeout set to 30 seconds
- [ ] IAM role has CloudFormation permissions
- [ ] Test in Lambda console works
- [ ] API Gateway route points to correct Lambda

---

## If Still Getting 502

**The issue is likely:**
1. **API Gateway not connected** - Re-create the `/delete` route
2. **Wrong Lambda selected** - Check API Gateway integration
3. **Lambda in different region** - Must be same region as API Gateway

**Quick fix:**
1. Delete the `/delete` route in API Gateway
2. Re-create it following the API-GATEWAY-SETUP-GUIDE.md
3. Deploy API Gateway
4. Test again
