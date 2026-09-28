import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


@pytest.fixture()
def app_env(tmp_path, monkeypatch):
    monkeypatch.setenv('DARKMAP_DATABASE_URL', f'sqlite:///{tmp_path}/test.db')
    monkeypatch.setenv('EXPERIENTIAL_LABS_API_KEY', '')
    monkeypatch.setenv('BRIGHT_DATA_API_KEY', '')
    monkeypatch.setenv('BRIGHT_DATA_SERP_ZONE', '')
    monkeypatch.setenv('DARKMAP_IG_ACCESS_TOKEN', '')
    monkeypatch.setenv('DARKMAP_IG_BUSINESS_ID', '')
    monkeypatch.setenv('DARKMAP_QUOTA_PER_MINUTE', '5')
    monkeypatch.setenv('DARKMAP_QUOTA_PER_DAY', '50')
    monkeypatch.setenv('DARKMAP_BACKOFF_BASE', '0.001')
    monkeypatch.setenv('DARKMAP_BACKOFF_MAX', '0.002')
    from darkmap import config, db
    config.reset_settings_cache()
    db.reset_engine()
    db.init_db()
    yield
    db.reset_engine()
    config.reset_settings_cache()


@pytest.fixture()
def session(app_env):
    from darkmap.db import get_sessionmaker
    s = get_sessionmaker()()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def seeded(app_env):
    from darkmap import seed
    seed.main(analyze=True)
    yield
