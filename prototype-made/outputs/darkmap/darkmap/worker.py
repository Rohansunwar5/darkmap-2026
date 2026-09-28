import argparse
import json
import random
import time
import uuid
from .config import Settings
from .db import init, connect, audit, quota
from .providers import RulesProvider, RemoteProvider, Retryable
from .risk import finalize

MAX_ATTEMPTS = 4
LEASE_SECONDS = 180

def run_once(settings, provider=None):
    now = time.time()
    token = str(uuid.uuid4())
    with connect(settings.db) as db:
        db.execute('BEGIN IMMEDIATE')
        expired = db.execute("SELECT id,attempts FROM jobs WHERE status='running' AND lease_until<?",(now,)).fetchall()
        for row in expired:
            status = 'failed' if row['attempts'] >= MAX_ATTEMPTS else 'queued'
            db.execute('UPDATE jobs SET status=?,lease_token=NULL,error=? WHERE id=?',(status,'Worker lease expired',row['id']))
            audit(db,'lease_expired',job_id=row['id'],status=status)
        job = db.execute("SELECT * FROM jobs WHERE status='queued' AND available<=? ORDER BY created,id LIMIT 1",(now,)).fetchone()
        if not job:
            return False
        if settings.provider != 'rules' and not quota(db,'claude',1,settings.claude_quota):
            db.execute('UPDATE jobs SET available=? WHERE id=?',((int(now//3600)+1)*3600,job['id']))
            audit(db,'provider_quota_deferred',job_id=job['id'])
            return True
        db.execute("UPDATE jobs SET status='running',attempts=attempts+1,lease_until=?,lease_token=? WHERE id=?",(now+LEASE_SECONDS,token,job['id']))
        audit(db,'analysis_started',job_id=job['id'],provider=settings.provider)
    try:
        payload = json.loads(job['payload'])
        selected = provider or (RulesProvider() if settings.provider=='rules' else RemoteProvider(settings))
        result = finalize(selected.analyze(payload),payload,settings.provider,settings.model if settings.provider!='rules' else 'risk-v1')
        encoded = json.dumps(result)
        with connect(settings.db) as db:
            db.execute('BEGIN IMMEDIATE')
            changed = db.execute("UPDATE jobs SET status='done',result=?,error=NULL,lease_token=NULL WHERE id=? AND lease_token=?",(encoded,job['id'],token)).rowcount
            if changed:
                db.execute('INSERT OR REPLACE INTO cache VALUES(?,?,?)',(job['cache_key'],encoded,time.time()+settings.cache_ttl))
                audit(db,'analysis_completed',job_id=job['id'],score=result['score'])
    except Exception as exc:
        retry = isinstance(exc,Retryable) and job['attempts']+1 < MAX_ATTEMPTS
        delay = max(2**(job['attempts']+1)+random.random(),exc.delay if isinstance(exc,Retryable) else 0)
        with connect(settings.db) as db:
            changed = db.execute('UPDATE jobs SET status=?,available=?,error=?,lease_token=NULL WHERE id=? AND lease_token=?',('queued' if retry else 'failed',time.time()+delay,type(exc).__name__,job['id'],token)).rowcount
            if changed:
                audit(db,'analysis_retry' if retry else 'analysis_failed',job_id=job['id'],error_type=type(exc).__name__)
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once',action='store_true',help='Process at most one ready job')
    args = parser.parse_args()
    s = Settings()
    if s.provider not in ('rules','experiential','anthropic'):
        raise SystemExit('Unsupported ANALYSIS_PROVIDER')
    init(s.db)
    if args.once:
        run_once(s)
    else:
        while True:
            if not run_once(s):
                time.sleep(1)

if __name__ == '__main__':
    main()
