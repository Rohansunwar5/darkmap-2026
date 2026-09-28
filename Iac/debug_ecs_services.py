import requests
import time

# ------------------------------------------------------------------
# 🛠️ SETUP: Paste your ALB DNS Names here
# You can find these in the EC2 Console -> Load Balancers
# ------------------------------------------------------------------
ALB_DNS_LIST = [
    "Service-Generic2-ELB-268435636.us-east-1.elb.amazonaws.com",
    "Service-Generic1-ELB-497178566.us-east-1.elb.amazonaws.com",
    "Service-Generic3-ELB-2058912044.us-east-1.elb.amazonaws.com",
    "Service-Generic4-ELB-3212480.us-east-1.elb.amazonaws.com",
    "Service-Generic5-ELB-315757034.us-east-1.elb.amazonaws.com",
]

ENDPOINT = "/api/retrieve-channel-names"
PORT = 5000
SEARCH_QUERY = "database leak"

def test_service(dns):
    url = f"http://{dns}:{PORT}{ENDPOINT}"
    print(f"\n🔍 Testing {url}...")
    
    try:
        start_time = time.time()
        response = requests.post(
            url, 
            data={"search_query": SEARCH_QUERY},
            timeout=10
        )
        elapsed = time.time() - start_time
        
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            channel_count = len(data.get("channel_names", []))
            print(f"   ✅ SUCCESS! Found {channel_count} channels.")
            print(f"   ⏱️ Time: {elapsed:.2f}s")
            # print(f"   Preview: {data.get('channel_names', [])[:3]}")
        elif response.status_code == 404:
            print(f"   ❌ FAILED: 404 Not Found.")
            print("   👉 CAUSE: The service is running but does NOT have this endpoint.")
            print("   👉 FIX: Accessing wrong endpoint or running old Docker image.")
        else:
            print(f"   ❌ FAILED: HTTP {response.status_code}")
            print(f"   Response: {response.text[:100]}")
            
    except requests.exceptions.ConnectionError:
        print("   ❌ FAILED: Connection Refused (or Timed Out).")
        print("   👉 CAUSE: Service is not listening on port 5000 or Security Group blocks access.")
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")

def main():
    print("🚀 Starting ECS Service Health Check...")
    print(f"Target Endpoint: {ENDPOINT}")
    print(f"Search Query: '{SEARCH_QUERY}'")
    
    if not ALB_DNS_LIST:
        print("\n⚠️  Please edit this script and add your ALB DNS names to the ALB_DNS_LIST!")
        return

    for dns in ALB_DNS_LIST:
        test_service(dns)

if __name__ == "__main__":
    main()
