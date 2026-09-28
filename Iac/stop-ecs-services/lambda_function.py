"""
Idle shutdown for the ECS-DarkMap Generic1-6 services.

Idleness is measured by INVOCATIONS OF THE SEARCH CONTROLLER LAMBDAS, not by ALB
RequestCount. Measured 2026-09-07: the six ALBs are public, and background
internet probes hit them every few minutes, so the 6-ALB RequestCount total
almost never stays at zero for 30 consecutive minutes - services would never be
reaped. Controller invocations only happen when a real search comes through
API Gateway (/tg and /tg-2), which is the actual "someone is using this" signal.

Everything is keyed on names that survive an IaC delete/recreate:

  cluster       ECS-DarkMap                        (permanent)
  services      Generic1..Generic6                 (stable)
  controllers   ECS-Service-Controller-*           (stable; Lambda names do not
                                                    change when ALBs are rebuilt)

No ALB ID is referenced anywhere, so recreating the infrastructure cannot break
it. It is also stateless: every invocation recomputes the decision, so unlike a
CloudWatch alarm there is no state to get stuck in.

Event options:
  {"dry_run": true}  report the decision, change nothing
  {"force": true}    skip the idle check and stop regardless (manual "stop now")
"""
import datetime
import os

import boto3

CLUSTER = os.getenv("CLUSTER_NAME", "ECS-DarkMap")
SERVICES = [s.strip() for s in os.getenv(
    "SERVICE_NAMES", "Generic1,Generic2,Generic3,Generic4,Generic5,Generic6").split(",") if s.strip()]
CONTROLLERS = [c.strip() for c in os.getenv(
    "CONTROLLER_FUNCTIONS",
    "ECS-Service-Controller-MyLambdaFunction-4dOCutIT76KM,"
    "ECS-Service-Controller-MyLambdaFunction-dynamic").split(",") if c.strip()]
IDLE_MINUTES = int(os.getenv("IDLE_MINUTES", "30"))
# A service that was just scaled up is "in use" even before the first search:
# starting it is itself an intent signal. Without this, a service started and
# not immediately searched gets reaped on the next 10-minute tick.
GRACE_MINUTES = int(os.getenv("STARTUP_GRACE_MINUTES", "30"))

ecs = boto3.client("ecs")
cloudwatch = boto3.client("cloudwatch")


def service_state():
    """{name: (desiredCount, last scale change)} for every service, one API call."""
    resp = ecs.describe_services(cluster=CLUSTER, services=SERVICES)
    state = {}
    for svc in resp["services"]:
        primary = next((d for d in svc.get("deployments", []) if d.get("status") == "PRIMARY"), None)
        state[svc["serviceName"]] = (svc["desiredCount"], primary.get("updatedAt") if primary else None)
    return state


def searches_in_window(minutes):
    """Count search-controller invocations over the trailing window."""
    if not CONTROLLERS:
        return 0.0
    end = datetime.datetime.now(datetime.timezone.utc)
    start = end - datetime.timedelta(minutes=minutes)
    queries = [
        {
            "Id": f"c{i}",
            "MetricStat": {
                "Metric": {
                    "Namespace": "AWS/Lambda",
                    "MetricName": "Invocations",
                    "Dimensions": [{"Name": "FunctionName", "Value": fn}],
                },
                "Period": 300,
                "Stat": "Sum",
            },
            "ReturnData": True,
        }
        for i, fn in enumerate(CONTROLLERS)
    ]
    resp = cloudwatch.get_metric_data(MetricDataQueries=queries, StartTime=start, EndTime=end)
    # Absent datapoints mean no invocations, which is exactly what we detect.
    return float(sum(sum(r["Values"]) for r in resp["MetricDataResults"]))


def stop(services):
    stopped, errors = [], {}
    for name in services:
        try:
            ecs.update_service(cluster=CLUSTER, service=name, desiredCount=0)
            stopped.append(name)
            print(f"stopped {name}")
        except Exception as exc:                      # keep going; report per service
            errors[name] = str(exc)
            print(f"ERROR stopping {name}: {exc}")
    return stopped, errors


def lambda_handler(event, context):
    event = event if isinstance(event, dict) else {}
    dry_run = bool(event.get("dry_run"))
    force = bool(event.get("force"))

    state = service_state()
    running = {n: d for n, (d, _) in state.items() if d > 0}
    searches = searches_in_window(IDLE_MINUTES)

    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now - datetime.timedelta(minutes=GRACE_MINUTES)
    just_started = {
        n: int((now - ts).total_seconds() // 60)
        for n, (d, ts) in state.items() if d > 0 and ts is not None and ts > cutoff
    }

    print(f"cluster={CLUSTER} running={running or 'none'} "
          f"searches_last_{IDLE_MINUTES}min={searches} "
          f"within_{GRACE_MINUTES}min_grace={just_started or 'none'} "
          f"force={force} dry_run={dry_run}")

    if not running and not force:
        return {"action": "none", "reason": "all services already at desiredCount 0",
                "searches": searches}

    if searches >= 1 and not force:
        return {"action": "none", "reason": f"{searches} searches in the last {IDLE_MINUTES} min",
                "running": running, "searches": searches}

    if just_started and not force:
        # Scaled up recently: give the operator a window to actually use it.
        return {"action": "none",
                "reason": f"scaled up {min(just_started.values())} min ago, "
                          f"inside the {GRACE_MINUTES} min startup grace",
                "running": running, "searches": searches, "grace": just_started}

    if dry_run:
        return {"action": "would_stop", "services": sorted(running or SERVICES),
                "searches": searches}

    stopped, errors = stop(sorted(running) if running else SERVICES)
    return {"action": "stopped", "services": stopped, "errors": errors,
            "searches": searches}
