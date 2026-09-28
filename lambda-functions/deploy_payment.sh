#!/usr/bin/env bash
# Create/update the Lambda + an HTTP API Gateway, print the invoke URL.
# Re-runnable: updates code if the function already exists.
set -euo pipefail
cd "$(dirname "$0")"

FN=payment-screenshot
REGION=${AWS_REGION:-ap-south-1}
ROLE_NAME=payment-lambda-role

ACCT=$(aws sts get-caller-identity --query Account --output text)

# 1. Basic execution role (idempotent)
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "waiting for role to propagate..."; sleep 10
fi
ROLE_ARN="arn:aws:iam::${ACCT}:role/${ROLE_NAME}"

# 2. Lambda: create or update
if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --region "$REGION" \
    --zip-file fileb://payment.zip >/dev/null
else
  aws lambda create-function --function-name "$FN" --region "$REGION" \
    --runtime python3.12 --architectures x86_64 \
    --handler payment.lambda_handler --role "$ROLE_ARN" \
    --timeout 30 --memory-size 512 \
    --zip-file fileb://payment.zip >/dev/null
fi
LAMBDA_ARN=$(aws lambda get-function --function-name "$FN" --region "$REGION" \
  --query Configuration.FunctionArn --output text)

# 3. HTTP API (v2) — proxy integration, auto-handles base64 image responses
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='${FN}-api'].ApiId | [0]" --output text)
if [ "$API_ID" = "None" ] || [ -z "$API_ID" ]; then
  API_ID=$(aws apigatewayv2 create-api --region "$REGION" --name "${FN}-api" \
    --protocol-type HTTP --target "$LAMBDA_ARN" --query ApiId --output text)
  aws lambda add-permission --function-name "$FN" --region "$REGION" \
    --statement-id apigw-invoke --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCT}:${API_ID}/*" >/dev/null
fi

echo ""
echo "Invoke URL:"
echo "  https://${API_ID}.execute-api.${REGION}.amazonaws.com/?amount=2000&to_address=royal%20urban%20store"
