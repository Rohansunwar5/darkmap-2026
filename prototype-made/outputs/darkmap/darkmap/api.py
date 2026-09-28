import hmac
import json
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Depends, Header, HTTPException, Query
from .config import Settings
from .db import init, connect, audit
from .ingestion import ingest
from .schemas import ImportBatch


def create_app(settings=None):
    settings = settings or Settings()
    @asynccontextmanager
    async def lifespan(app):
        if not settings.api_key:
            raise RuntimeError('Set DARKMAP_API_KEY before starting the API')
        init(settings.db)
        yield
    app = FastAPI(title='Darkmap',version='0.1.0',lifespan=lifespan)

    def authenticate(x_api_key: str = Header(default='')):
        if not settings.api_key or not hmac.compare_digest(x_api_key,settings.api_key):
            raise HTTPException(401,'Invalid API key')

    @app.get('/health')
    def health():
        return {'status':'ok'}

    @app.post('/imports',status_code=202,dependencies=[Depends(authenticate)])
    def imports(batch: ImportBatch):
        jobs = ingest(settings,batch)
        if jobs is None:
            raise HTTPException(429,'Hourly ingestion quota exhausted',headers={'Retry-After':'3600'})
        return {'job_ids':jobs}

    @app.get('/jobs/{job_id}',dependencies=[Depends(authenticate)])
    def job(job_id: str):
        with connect(settings.db) as db:
            row = db.execute('SELECT id,entity_id,status,attempts,available,error,result FROM jobs WHERE id=?',(job_id,)).fetchone()
        if not row:
            raise HTTPException(404,'Job not found')
        result = dict(row)
        result['result'] = json.loads(result['result']) if result['result'] else None
        return result

    @app.get('/search',dependencies=[Depends(authenticate)])
    def search(q: str = Query(default='',max_length=500),brand: Optional[str]=None,
               account: Optional[str]=None,kind: Optional[str]=None,
               limit: int=Query(default=20,ge=1,le=100),offset: int=Query(default=0,ge=0)):
        escaped = q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
        clauses,params = ["search_text LIKE ? ESCAPE '\\'"],['%'+escaped+'%']
        for column,value in [('brand',brand),('account',account),('kind',kind)]:
            if value is not None:
                clauses.append(column+'=?')
                params.append(value.lstrip('@').casefold() if column == 'account' else value.casefold())
        where = ' AND '.join(clauses)
        with connect(settings.db) as db:
            rows = db.execute('SELECT id,payload FROM entities WHERE '+where+' ORDER BY id LIMIT ? OFFSET ?',params+[limit,offset]).fetchall()
            total = db.execute('SELECT count(*) FROM entities WHERE '+where,params).fetchone()[0]
            audit(db,'search',returned=len(rows))
        return {'total':total,'items':[{'id':r['id'],'entity':json.loads(r['payload'])} for r in rows]}

    @app.get('/audit',dependencies=[Depends(authenticate)])
    def audits(limit: int=Query(default=50,ge=1,le=500)):
        with connect(settings.db) as db:
            return [dict(r) for r in db.execute('SELECT * FROM audit ORDER BY id DESC LIMIT ?',(limit,))]
    return app

app = create_app()
