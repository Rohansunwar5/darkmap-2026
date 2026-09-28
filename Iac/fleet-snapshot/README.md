# Fleet snapshot — taken 2026-09-09, immediately before decommissioning

Full configuration of the 6-service scraping fleet as it ran in production, kept
so it can be rebuilt if the Decodo-backed replacement ever has to be reversed.
The scratchpad copy is temporary; this one is not.

| File | Contents |
|---|---|
| `ecs-services.json` | All 6 services: network config, LB bindings, deployment settings |
| `albs.json` | The 6 ALBs incl. DNS names, subnets, security groups |
| `target-groups.json` | Target groups with health-check settings |
| `listeners.json` | Listener rules per ALB (port 5000 -> target group) |
| `cfn-Generic{1..6}.json` | The CloudFormation templates that created each stack |
| `taskdef-Generic{1..6}.json` | Live task definitions (the revisions actually running, NOT the older ones the CFN templates pin) |
| `controller-lambda-config.json` | The old controller Lambda's env, incl. the 5 ALB URLs |

## Rebuilding

Do NOT rebuild by re-running the `ECS-Darkmap-infrastructure` Lambda: its
templates pin OLDER task-definition revisions than what was live (Generic1 :13
vs :11, Generic2 :12 vs :1, Generic3/4 :12 vs :10), so it would silently
downgrade. Use `taskdef-Generic*.json` here for the revisions that were actually
running.

ALB DNS names change on recreation, so `API_URLS` on the controller Lambda would
need updating — see `controller-lambda-config.json` for the old values.
