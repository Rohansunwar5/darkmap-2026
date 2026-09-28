"""Decision-table check for the idle shutdown. Run: python test_idle_shutdown.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lambda_function as f

import datetime
OLD = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=3)
NEW = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=2)

def scenario(running, searches, event, scaled_at=OLD):
    f.service_state = lambda: {n: (d, scaled_at) for n, d in dict(running).items()} or {}
    f.searches_in_window = lambda m: searches
    stopped = []
    f.stop = lambda svcs: (stopped.extend(svcs) or (list(svcs), {}))
    result = f.lambda_handler(event, None)
    return result, stopped

BUSY = {"Generic1": 3, "Generic2": 3}

# idle + running  -> stop
r, stopped = scenario(BUSY, 0.0, {})
assert r["action"] == "stopped", r
assert stopped == ["Generic1", "Generic2"], stopped

# a real search + running -> refuse
r, stopped = scenario(BUSY, 7.0, {})
assert r["action"] == "none" and "7.0 searches" in r["reason"], r
assert stopped == [], stopped

# a single search in the window is enough to keep it alive
r, _ = scenario(BUSY, 1.0, {})
assert r["action"] == "none", r

# already stopped -> no-op even with zero traffic (cannot get stuck re-stopping)
r, stopped = scenario({}, 0.0, {})
assert r["action"] == "none" and "already at desiredCount 0" in r["reason"], r
assert stopped == [], stopped

# dry_run never mutates
r, stopped = scenario(BUSY, 0.0, {"dry_run": True})
assert r["action"] == "would_stop" and stopped == [], (r, stopped)

# force overrides both the idle check and the already-stopped check
r, stopped = scenario(BUSY, 500.0, {"force": True})
assert r["action"] == "stopped", r
r, stopped = scenario({}, 500.0, {"force": True})
assert r["action"] == "stopped", r

# background ALB noise is irrelevant now: only controller invocations count,
# so zero searches means stop even though the public ALBs are being probed.
r, stopped = scenario(BUSY, 0.0, {})
assert r["action"] == "stopped", r

# non-dict event (scheduler/alarm payloads vary) must not crash
r, _ = scenario(BUSY, 0.0, None)
assert r["action"] == "stopped", r

# a service scaled up 2 min ago is protected even with zero searches
r, stopped = scenario(BUSY, 0.0, {}, scaled_at=NEW)
assert r["action"] == "none" and "startup grace" in r["reason"], r
assert stopped == [], stopped

# ...but once the grace window has passed and it is still unused, it stops
r, stopped = scenario(BUSY, 0.0, {}, scaled_at=OLD)
assert r["action"] == "stopped", r

# force still overrides the grace window
r, stopped = scenario(BUSY, 0.0, {"force": True}, scaled_at=NEW)
assert r["action"] == "stopped", r

print("all decision branches passed")
