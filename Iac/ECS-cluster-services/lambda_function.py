import boto3
import concurrent.futures
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ecs_client = boto3.client('ecs')

def update_service(cluster, service):
    try:
        logger.info(f"Updating service {service} in cluster {cluster}.")
        response = ecs_client.update_service(
            cluster=cluster,
            service=service,
            desiredCount=3
        )
        logger.info(f"Service {service} in cluster {cluster} updated successfully.")
    except Exception as e:
        logger.error(f"Failed to update service {service} in cluster {cluster}: {e}")

def lambda_handler(event, context):
    logger.info("Lambda function started.")
    
    cluster = 'ECS-DarkMap'
    services = ['Generic1','Generic2','Generic3','Generic4','Generic5','Generic6']
    
    # Using ThreadPoolExecutor for asynchronous execution
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(update_service, cluster, service) for service in services]
        
        # Wait for all futures to complete and log any errors
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as e:
                logger.error(f"An error occurred: {e}")
    
    logger.info("Lambda function completed.")
    
    return {
        'statusCode': 200,
        'body': 'ECS services started asynchronously'
    }
