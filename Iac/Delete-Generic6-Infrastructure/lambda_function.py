import json
import boto3
from botocore.exceptions import ClientError

def lambda_handler(event, context):
    """
    Delete ONLY the Generic6 ECS infrastructure stack.
    Returns immediately after initiating deletions.
    """
    cloudformation = boto3.client('cloudformation')
    
    # Only target Generic6
    stack_name = "ECS-Service-Generic6"
    
    deleted_stacks = []
    skipped_stacks = []
    error_stacks = []
    
    try:
        # This call is async - it just initiates deletion and returns immediately
        cloudformation.delete_stack(StackName=stack_name)
        deleted_stacks.append(stack_name)
        print(f"Initiated deletion for {stack_name}")
    except ClientError as e:
        error_message = str(e)
        # Stack doesn't exist - that's fine
        if 'does not exist' in error_message or 'ValidationError' in error_message:
            skipped_stacks.append(stack_name)
            print(f"Skipped {stack_name} - does not exist")
        else:
            error_stacks.append(stack_name)
            print(f"Error deleting {stack_name}: {error_message}")
    except Exception as e:
        error_stacks.append(stack_name)
        print(f"Unexpected error deleting {stack_name}: {str(e)}")
    
    # Return immediately - don't wait for actual deletion
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({
            'status': 'success',
            'message': '🗑️ Deleting Dork6 Infrastructure (Isolated)...',
            'details': f'Deletion initiated for {len(deleted_stacks)} stacks. This process takes 2-5 minutes to complete.',
            'stacks_deleting': deleted_stacks,
            'stacks_skipped': skipped_stacks,
            'stacks_error': error_stacks,
            'note': 'Check CloudFormation console to monitor deletion progress.'
        })
    }
