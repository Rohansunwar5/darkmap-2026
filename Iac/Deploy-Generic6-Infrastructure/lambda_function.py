import json
import boto3
from botocore.exceptions import ClientError

def get_load_balancer_details(load_balancer_name):
    """Fetch ALB details strictly for Generic6"""
    elbv2 = boto3.client('elbv2')
    try:
        response = elbv2.describe_load_balancers(Names=[load_balancer_name])
        if response['LoadBalancers']:
            return response['LoadBalancers'][0]
    except ClientError:
        pass
    return None

def update_lambda_environment_variables(function_name, new_environment_variables):
    lambda_client = boto3.client('lambda')
    try:
        response = lambda_client.get_function_configuration(FunctionName=function_name)
        existing_env = response.get('Environment', {}).get('Variables', {})
        updated_env = {**existing_env, **new_environment_variables}
        lambda_client.update_function_configuration(
            FunctionName=function_name,
            Environment={'Variables': updated_env}
        )
        return True
    except ClientError as e:
        print(f"Error updating Lambda env: {e}")
        return False

def lambda_handler(event, context):
    """
    Dedicated script to spin up ONLY Generic6 infrastructure.
    This prevents Generic6 dynamic query scraper from interfering with Generic 1-5 legacy systems.
    """
    cloudformation = boto3.client('cloudformation')
    
    # We only care about Generic6
    file_name = "Generic6.json"
    stack_name = "ECS-Service-Generic6"
    
    created_stacks = []
    updated_stacks = []
    skipped_stacks = []
    
    try:
        with open(file_name, 'r') as file:
            template_body = json.load(file)
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'status': 'error', 'message': f"Error reading {file_name}: {str(e)}"})
        }

    try:
        # Check if the stack already exists
        try:
            cloudformation.describe_stacks(StackName=stack_name)
            stack_exists = True
        except ClientError as e:
            if 'does not exist' in str(e):
                stack_exists = False
            else:
                raise e

        # Create or update the stack accordingly
        if stack_exists:
            try:
                cloudformation.update_stack(
                    StackName=stack_name,
                    TemplateBody=json.dumps(template_body),
                    Capabilities=['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND']
                )
                updated_stacks.append(stack_name)
            except ClientError as e:
                if 'No updates are to be performed' in str(e):
                    skipped_stacks.append(stack_name)
                else:
                    raise e
        else:
            cloudformation.create_stack(
                StackName=stack_name,
                TemplateBody=json.dumps(template_body),
                Capabilities=['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND']
            )
            created_stacks.append(stack_name)
            
    except ClientError as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'status': 'error', 'message': f"Stack operation failed: {str(e)}"})
        }

    # Fetch resulting ALB DNS and update the new Controller Lambda
    alb_dns = None
    load_balancer_name = "Service-Generic6-ELB"
    try:
        alb_info = get_load_balancer_details(load_balancer_name)
        if alb_info and "DNSName" in alb_info:
            alb_dns = f"http://{alb_info['DNSName']}:5000/api/retrieve-channel-names"
            
            # Automatically update the new dynamic controller lambda!
            update_lambda_environment_variables(
                "ECS-Service-Controller-MyLambdaFunction-dynamic",
                {"API_URLS": alb_dns}
            )
    except Exception:
        pass

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({
            'status': 'success',
            'message': '🚀 Creating Dork6 Infrastructure (Isolated)...',
            'created': created_stacks,
            'updated': updated_stacks,
            'skipped': skipped_stacks,
            'future_alb_url': alb_dns if alb_dns else "Will be available after creation finishes (approx 5 mins)."
        })
    }
