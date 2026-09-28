"""Pin the row order REF's SQLite queries return when they have no ORDER BY (spec §10)."""
import json
import pathlib
import sqlite3

OUT = pathlib.Path(__file__).resolve().parent / 'sqlite-order.json'
db = sqlite3.connect(':memory:')
db.executescript('''
CREATE TABLE posts (id INTEGER NOT NULL, account_id INTEGER NOT NULL, platform_post_id VARCHAR(160),
  posted_at DATETIME, PRIMARY KEY (id), CONSTRAINT uq_post_account_platform_id UNIQUE (account_id, platform_post_id));
CREATE INDEX ix_posts_posted_at ON posts (posted_at);
CREATE INDEX ix_posts_account_posted ON posts (account_id, posted_at);
CREATE TABLE search_documents (id INTEGER NOT NULL, doc_type VARCHAR(20) NOT NULL, account_id INTEGER,
  post_id INTEGER, handle VARCHAR(200), title VARCHAR(400), body TEXT, body_lower TEXT, hashtags JSON,
  mentions JSON, domains JSON, risk_score FLOAT, posted_at DATETIME, updated_at DATETIME, PRIMARY KEY (id),
  CONSTRAINT uq_search_doc UNIQUE (doc_type, account_id, post_id));
CREATE INDEX ix_search_documents_doc_type ON search_documents (doc_type);
CREATE INDEX ix_search_documents_account_id ON search_documents (account_id);
CREATE INDEX ix_search_documents_handle ON search_documents (handle);
CREATE INDEX ix_search_documents_risk_score ON search_documents (risk_score);
CREATE INDEX ix_search_documents_posted_at ON search_documents (posted_at);
CREATE TABLE entities (id INTEGER NOT NULL, account_id INTEGER, post_id INTEGER, comment_id INTEGER,
  kind VARCHAR(30) NOT NULL, value VARCHAR(600) NOT NULL, value_lower VARCHAR(600) NOT NULL,
  domain VARCHAR(300), source_field VARCHAR(40), created_at DATETIME, PRIMARY KEY (id));
CREATE INDEX ix_entities_account_id ON entities (account_id);
CREATE INDEX ix_entities_post_id ON entities (post_id);
CREATE INDEX ix_entities_kind ON entities (kind);
CREATE INDEX ix_entities_value_lower ON entities (value_lower);
CREATE INDEX ix_entities_domain ON entities (domain);
''')
posts = [(1, 7, 'a', '2026-09-20 10:00:00.000000'), (2, 7, 'b', None), (3, 7, 'c', '2026-09-20 10:00:00.000000'),
         (4, 7, 'd', '2026-09-19 09:00:00.000000'), (5, 8, 'e', None), (6, 7, 'f', None),
         (7, 7, 'g', '2026-09-21 08:00:00.000000')]
db.executemany('INSERT INTO posts (id, account_id, platform_post_id, posted_at) VALUES (?, ?, ?, ?)', posts)
docs = [(1, 'account', 3, None), (2, 'post', 1, 10), (3, 'account', 1, None), (4, 'post', 3, 11),
        (5, 'post', 2, 12), (6, 'account', 2, None), (7, 'post', 1, 13)]
db.executemany("INSERT INTO search_documents (id, doc_type, account_id, post_id, body_lower, handle) "
               "VALUES (?, ?, ?, ?, 'brand', 'h')", docs)
db.executemany("INSERT INTO entities (id, account_id, post_id, kind, value, value_lower) VALUES (?, ?, ?, 'url', 'v', 'v')",
               [(1, 5, None), (2, 4, 1), (3, 5, 2), (4, 5, None), (5, 4, None), (6, 5, 3)])
q = lambda sql, args=(): [row[0] for row in db.execute(sql, args)]
OUT.write_text(json.dumps({
    'posts': posts, 'docs': docs,
    'posts_of_account': q('SELECT posts.id FROM posts WHERE posts.account_id = ?', (7,)),
    'posts_for_dossier': q('SELECT posts.id FROM posts WHERE posts.account_id = ? '
                           'ORDER BY posts.posted_at DESC NULLS LAST LIMIT ? OFFSET ?', (7, 40, 0)),
    'docs_in': q('SELECT search_documents.id FROM search_documents WHERE search_documents.account_id '
                 'IN (?, ?, ?) LIMIT ? OFFSET ?', (3, 1, 2, 2000, 0)),
    'docs_in_like': q("SELECT search_documents.id FROM search_documents WHERE search_documents.account_id "
                      "IN (?, ?, ?) AND (search_documents.body_lower LIKE ? ESCAPE '\\' OR "
                      "lower(search_documents.handle) LIKE ? ESCAPE '\\') LIMIT ? OFFSET ?",
                      (3, 1, 2, '%brand%', '%brand%', 2000, 0)),
    'docs_like': q("SELECT search_documents.id FROM search_documents WHERE (search_documents.body_lower "
                   "LIKE ? ESCAPE '\\') LIMIT ? OFFSET ?", ('%brand%', 2000, 0)),
    'entities_of_account': q('SELECT entities.id FROM entities WHERE entities.account_id = ? LIMIT ? OFFSET ?',
                             (5, 500, 0)),
    'sqlite_version': sqlite3.sqlite_version,
}, indent=1))
print(OUT.read_text())
