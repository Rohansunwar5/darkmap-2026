import json
import boto3
from botocore.exceptions import ClientError

def update_lambda_environment_variables(function_name, new_environment_variables):
    # Initialize boto3 Lambda client
    lambda_client = boto3.client('lambda')
    
    try:
        # Get the current configuration of the Lambda function
        response = lambda_client.get_function_configuration(FunctionName=function_name)
        
        # Merge existing environment variables with the new ones
        existing_environment_variables = response['Environment']['Variables'] if 'Environment' in response else {}
        updated_environment_variables = {**existing_environment_variables, **new_environment_variables}
        
        # Update the Lambda function configuration with the new environment variables
        update_response = lambda_client.update_function_configuration(
            FunctionName=function_name,
            Environment={
                'Variables': updated_environment_variables
            }
        )
        
        return {
            'statusCode': 200,
            'body': f'Successfully updated environment variables for {function_name}'
        }
    
    except ClientError as e:
        return {
            'statusCode': 500,
            'body': f'Error updating environment variables: {str(e)}'
        }

def get_load_balancer_details(load_balancer_name):
    # Initialize boto3 ELBv2 client (Elastic Load Balancing v2 for ALB/NLB)
    elbv2 = boto3.client('elbv2')
    
    try:
        # Describe the specific load balancer by name or ARN
        response = elbv2.describe_load_balancers(
            Names=[load_balancer_name]  # You can also use 'LoadBalancerArns' instead of 'Names'
        )
        
        # Extract the load balancer details from the response
        if response['LoadBalancers']:
            load_balancer_details = response['LoadBalancers'][0]  # Assuming the name/ARN is unique
            return load_balancer_details
        else:
            return None
    
    except ClientError as e:
        return None

def lambda_handler(event, context):
    # Initialize boto3 CloudFormation client
    cloudformation = boto3.client('cloudformation')
    Active_File_List = ["Generic1.json", "Generic2.json", "Generic3.json", "Generic4.json", "Generic5.json"]
    
    created_stacks = []
    updated_stacks = []
    skipped_stacks = []
    
    # Read and process each stack
    for i in Active_File_List:
        stack_name = "ECS-Service-" + i.replace(".json", "")
        
        try:
            with open(f'{i}', 'r') as file:
                template_body = json.load(file)
        except Exception as e:
            print(f"Error reading {i}: {str(e)}")
            skipped_stacks.append(stack_name)
            continue
        
        try:
            # Check if the stack exists
            try:
                cloudformation.describe_stacks(StackName=stack_name)
                stack_exists = True
            except ClientError as e:
                if 'does not exist' in str(e):
                    stack_exists = False
                else:
                    raise e

            # Create or update the stack
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
            print(f"Error with stack {stack_name}: {str(e)}")
            skipped_stacks.append(stack_name)
            continue

    # Collect DNS names from any existing ALBs
    DNSList = []
    APIUrl = "http://DNS:5000/api/retrieve-channel-names"
    for i in Active_File_List:
        load_balancer_name = "Service-" + i.replace(".json", "") + "-ELB"
        try:
            result = get_load_balancer_details(load_balancer_name)
            if result and "DNSName" in result:
                DNSList.append(APIUrl.replace("DNS", result["DNSName"]))
                print(f"Found DNS for {load_balancer_name}: {result['DNSName']}")
        except Exception as e:
            print(f"Error getting DNS for {load_balancer_name}: {str(e)}")
            continue
    
    # Only update Lambda if we have at least one DNS
    if DNSList:
        urls_string = ', '.join(DNSList)
        function_name = "ECS-Service-Controller-MyLambdaFunction-4dOCutIT76KM"
        new_env_vars = {
            "API_URLS": urls_string,
        }
        update_lambda_environment_variables(function_name, new_env_vars)
        print(f"Updated Lambda with {len(DNSList)} URLs")

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({
            'status': 'success',
            'message': '🚀 Creating ECS Infrastructure...',
            'details': f'Stack operations initiated. Creating: {len(created_stacks)}, Updating: {len(updated_stacks)}, Skipped: {len(skipped_stacks)}',
            'stacks_creating': created_stacks,
            'stacks_updating': updated_stacks,
            'stacks_skipped': skipped_stacks,
            'existing_services': len(DNSList),
            'note': 'Stack creation takes 5-7 minutes. Check CloudFormation console for progress.'
        })
    }

