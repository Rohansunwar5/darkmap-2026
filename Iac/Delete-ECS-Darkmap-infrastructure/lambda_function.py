import json
import boto3
from botocore.exceptions import ClientError

def lambda_handler(event, context):
    """
    Delete all ECS infrastructure stacks.
    Returns immediately after initiating deletions.
    """
    cloudformation = boto3.client('cloudformation')
    Active_File_List = ["Generic1.json", "Generic2.json", "Generic3.json", "Generic4.json", "Generic5.json"]
    
    deleted_stacks = []
    skipped_stacks = []
    error_stacks = []
    
    # Delete stacks one by one (fast enough - each call is async)
    for i in Active_File_List:
        stack_name = "ECS-Service-" + i.replace(".json", "")
        
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
            'message': '🗑️ Deleting ECS Infrastructure...',
            'details': f'Deletion initiated for {len(deleted_stacks)} stacks. This process takes 2-5 minutes to complete.',
            'stacks_deleting': deleted_stacks,
            'stacks_skipped': skipped_stacks,
            'stacks_error': error_stacks,
            'note': 'Check CloudFormation console to monitor deletion progress.'
        })
    }
