import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

@dataclass
class Settings:
    db: str = os.getenv("DARKMAP_DB", "darkmap.sqlite3")
    api_key: str = os.getenv("DARKMAP_API_KEY", "")
    provider: str = os.getenv("ANALYSIS_PROVIDER", "rules")
    anthropic_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    model: str = os.getenv("CLAUDE_MODEL", "claude-opus-5")
    ingest_quota: int = int(os.getenv("INGEST_ENTITIES_PER_HOUR", "10000"))
    claude_quota: int = int(os.getenv("CLAUDE_CALLS_PER_HOUR", "60"))
    cache_ttl: int = int(os.getenv("CACHE_TTL_SECONDS", "86400"))
    experiential_key: str = os.getenv("EXPERIENTIAL_LABS_API_KEY", "")
