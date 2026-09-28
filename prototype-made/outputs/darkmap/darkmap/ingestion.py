import hashlib
import json
import re
import time
import uuid
from typing import Protocol
from .db import connect, audit, quota
from .schemas import ImportBatch

VERSION = "risk-v1"

class IngestionProvider(Protocol):
    def collect(self, payload: dict) -> ImportBatch: ...

class AuthorizedExportProvider:
    def collect(self, payload: dict) -> ImportBatch:
        return ImportBatch.model_validate(payload)

def normalize(entity):
    e = entity.model_dump(mode="json")
    text = " ".join([e["bio"], e["caption"]])
    e["mentions"] = sorted(set(x.lstrip("@").lower() for x in e["mentions"]) | set(re.findall(r"(?<!\w)@([\w.]+)", text)))
    e["hashtags"] = sorted(set(x.lstrip("#").lower() for x in e["hashtags"]) | set(x.lower() for x in re.findall(r"(?<!\w)#(\w+)", text)))
    e["urls"] = sorted(set(e["urls"]) | set(x.rstrip(".,!;)") for x in re.findall(r"https?://[^\s<>]+", text)))
    return e

def ingest(settings, batch):
    now = time.time()
    ids = []
    brand = batch.brand.model_dump(mode="json")
    with connect(settings.db) as db:
        db.execute("BEGIN IMMEDIATE")
        if not quota(db, "ingest", len(batch.entities), settings.ingest_quota):
            audit(db, "ingest_quota_denied", count=len(batch.entities))
            return None
        normalized = []
        for entity in batch.entities:
            e = normalize(entity)
            eid = hashlib.sha256(json.dumps([brand["name"].casefold(), e["kind"], e["external_id"]]).encode()).hexdigest()
            search = " ".join([e["account"], e["display_name"], e["bio"], e["caption"], *e["mentions"], *e["hashtags"], *e["urls"]])
            db.execute(
                """INSERT INTO entities(id,brand,account,kind,search_text,payload,updated)
                   VALUES(?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET
                     brand=excluded.brand, account=excluded.account, kind=excluded.kind,
                     search_text=excluded.search_text, payload=excluded.payload,
                     updated=excluded.updated""",
                (eid, brand["name"].casefold(), e["account"], e["kind"], search, json.dumps(e), now),
            )
            normalized.append((eid,e))
        # Bounded corpus context, deterministic order; no cross-brand leakage.
        peers = [json.loads(r[0]) for r in db.execute("SELECT payload FROM entities WHERE brand=? ORDER BY id LIMIT 1000", (brand["name"].casefold(),))]
        for eid,e in normalized:
            context = sorted({p["account"] for p in peers if p["account"] != e["account"] and set(p["urls"]) & set(e["urls"])})
            payload = {"entity": e, "brand": brand, "shared_url_accounts": context}
            key = hashlib.sha256(json.dumps([VERSION,settings.provider,settings.model,payload],sort_keys=True).encode()).hexdigest()
            existing = db.execute("SELECT id FROM jobs WHERE cache_key=? AND status IN ('queued','running')", (key,)).fetchone()
            if existing:
                ids.append(existing[0])
                continue
            cached = db.execute("SELECT result FROM cache WHERE key=? AND expires>?", (key,now)).fetchone()
            if cached:
                existing = db.execute(
                    "SELECT id FROM jobs WHERE cache_key=? AND status='done' AND result=? ORDER BY created DESC LIMIT 1",
                    (key, cached[0]),
                ).fetchone()
                if existing:
                    audit(db, "idempotent_import", job_id=existing[0], entity_id=eid)
                    ids.append(existing[0])
                    continue
            jid = str(uuid.uuid4())
            db.execute("INSERT INTO jobs(id,entity_id,cache_key,payload,status,available,result,created) VALUES(?,?,?,?,?,?,?,?)", (jid,eid,key,json.dumps(payload),"done" if cached else "queued",now,cached[0] if cached else None,now))
            audit(db,"cache_hit" if cached else "job_enqueued",job_id=jid,entity_id=eid)
            ids.append(jid)
        audit(db,"export_ingested",count=len(ids),brand=brand["name"])
    return ids
