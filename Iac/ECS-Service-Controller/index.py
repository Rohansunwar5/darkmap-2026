import os
import time
import json
import httpx
import concurrent.futures

api_urls_env = os.getenv("API_URLS", "")
API_URLS = api_urls_env.split(',') if api_urls_env else []

def fetch_api(url, payload):
    """
    Fetches data from the given API URL with the provided payload.
    """
    start_time = time.time()
    url = url.strip()

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(url, data=payload)
            elapsed_time = time.time() - start_time

            if response.status_code == 200:
                data = response.json()
                print(f"Response from {url}: {data}") 

                if "channels" in data or "channel_names" in data:
                    print(f"Successfully fetched {url} in {elapsed_time:.2f} seconds.")
                    return data
                else:
                    print(f"Unexpected response format from {url}.")
            else:
                print(f"Error fetching {url}: HTTP {response.status_code}.")
    except Exception as e:
        elapsed_time = time.time() - start_time
        print(f"Exception fetching {url}: {e}. Time taken: {elapsed_time:.2f} seconds.")

    return {}

def fetch_all_apis(urls, payload):
    """
    Fetches data from all APIs concurrently using threading.
    """
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_url = {executor.submit(fetch_api, url, payload): url for url in urls}
        for future in concurrent.futures.as_completed(future_to_url):
            result = future.result()
            if result:
                results.append(result)
    return results

def lambda_handler(event, context):
    """
    AWS Lambda handler function.
    """
    try:
        
        body = event.get("body")
        if not body:
            return {
                'statusCode': 400,
                'body': json.dumps({"error": "search_query is required"})
            }

        
        body_dict = json.loads(body)
        search_query = body_dict.get('search_query')

        if not search_query:
            return {
                'statusCode': 400,
                'body': json.dumps({"error": "search_query is required"})
            }

        include_keywords = body_dict.get('include_keywords')
        exclude_keywords = body_dict.get('exclude_keywords')

        payload = {'search_query': search_query}
        if include_keywords:
            payload['include_keywords'] = include_keywords
        if exclude_keywords:
            payload['exclude_keywords'] = exclude_keywords
            
        print(f"Payload: {payload}")  

        
        results = fetch_all_apis(API_URLS, payload)


        # Merge the six services, deduping by channel name and keeping the
        # richest description any of them found for it.
        channels_by_name = {}
        for result in results:
            for channel in result.get("channels", []):
                name = channel.get("name")
                if not name:
                    continue
                existing = channels_by_name.get(name)
                if existing is None or len(channel.get("description") or "") > len(existing.get("description") or ""):
                    channels_by_name[name] = channel
            # A service still running the old image only returns channel_names.
            for name in result.get("channel_names", []):
                channels_by_name.setdefault(name, {"name": name, "title": "", "description": "", "url": ""})

        
        keywords = [
            "News", "ias", "upsc", "exam", "movies", "movie", "currentaffairs", "affair",
            "times", "Newspaper", "paper", "academy", "chess", "bytes", "MEGHUPDATES",
            "Insight SSB", "Insight", "Gurukul", "Premier League", "Geopolitics", "politics",
            "Update", "Updates", "tech", "noel", "Pravda", "course", "helper", "University",
            "success", "football", "sports", "Mechanical", "PapersWIKI", "Papers", "soccer",
            "memes", "Editorial", "Bulletin", "Coverage", "Story", "Newsletter", "Headline",
            "notes", "Media", "latest", "Ngo", "journalist", "reporter", "live", "Lovers",
            "Literature", "facts", "telugu", "RAJA_Loot_Deals", "southfronteng", "bgmi",
            "game", "deals", "gamer", "Bazaar", "Coupons", "Editor", "itarmyofukraine2022","TV","Study","education"
        ]


        noise = [k.lower() for k in keywords]

        def is_noise(channel):
            return any(sub in channel["name"].lower() for sub in noise)

        all_channels = list(channels_by_name.values())
        rearranged_channels = [c for c in all_channels if not is_noise(c)] + [c for c in all_channels if is_noise(c)]

        return {
            'statusCode': 200,
            'body': json.dumps({
                "channel_names": [c["name"] for c in rearranged_channels],
                "channels": rearranged_channels,
            }),
            'headers': {
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST'
            },
        }

    except Exception as e:
        print(f"Error in Lambda function: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({"error": "Internal Server Error"})
        }