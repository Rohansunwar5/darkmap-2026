'''Environment configuration for Darkmap.'''
from functools import lru_cache
from typing import List

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore', case_sensitive=False)

    env: str = Field(default='local', alias='DARKMAP_ENV')
    database_url: str = Field(default='sqlite:///./darkmap.db', alias='DARKMAP_DATABASE_URL')
    api_key: str = Field(default='', alias='DARKMAP_API_KEY')
    max_request_bytes: int = Field(default=2_000_000, alias='DARKMAP_MAX_REQUEST_BYTES')
    max_export_bytes: int = Field(default=20_000_000, alias='DARKMAP_MAX_EXPORT_BYTES')

    # --- AI provider (Experiential Labs Claude Opus) ---
    experiential_labs_api_key: str = Field(
        default='',
        validation_alias=AliasChoices('EXPLABS_API_KEY', 'EXPERIENTIAL_LABS_API_KEY'),
    )
    experiential_labs_base_url: str = Field(
        default='https://api.experientiallabs.ai/v1', alias='EXPERIENTIAL_LABS_BASE_URL')
    analysis_model: str = Field(default='claude-opus-5', alias='DARKMAP_ANALYSIS_MODEL')
    analysis_max_tokens: int = Field(default=2000, alias='DARKMAP_ANALYSIS_MAX_TOKENS')
    analysis_timeout: float = Field(default=60.0, alias='DARKMAP_ANALYSIS_TIMEOUT')

    # --- ingestion ---
    ig_access_token: str = Field(default='', alias='DARKMAP_IG_ACCESS_TOKEN')
    ig_business_id: str = Field(default='', alias='DARKMAP_IG_BUSINESS_ID')
    ig_api_base: str = Field(default='https://graph.facebook.com/v26.0', alias='DARKMAP_IG_API_BASE')
    bright_data_api_key: str = Field(default='', alias='BRIGHT_DATA_API_KEY')
    bright_data_serp_zone: str = Field(default='', alias='BRIGHT_DATA_SERP_ZONE')
    bright_data_api_base: str = Field(
        default='https://api.brightdata.com', alias='BRIGHT_DATA_API_BASE')
    bright_data_max_wait_seconds: int = Field(
        default=90, alias='BRIGHT_DATA_MAX_WAIT_SECONDS')
    public_page_allowlist: List[str] = Field(default_factory=list, alias='DARKMAP_PUBLIC_PAGE_ALLOWLIST')
    user_agent: str = Field(
        default='DarkmapBrandProtection/1.0 (+https://example.com/darkmap-bot)',
        alias='DARKMAP_USER_AGENT')

    # --- politeness controls ---
    quota_per_minute: int = Field(default=30, alias='DARKMAP_QUOTA_PER_MINUTE')
    quota_per_day: int = Field(default=5000, alias='DARKMAP_QUOTA_PER_DAY')
    max_retries: int = Field(default=4, alias='DARKMAP_MAX_RETRIES')
    backoff_base: float = Field(default=0.5, alias='DARKMAP_BACKOFF_BASE')
    backoff_max: float = Field(default=30.0, alias='DARKMAP_BACKOFF_MAX')
    cache_ttl: int = Field(default=900, alias='DARKMAP_CACHE_TTL')
    search_cursor_secret: str = Field(default='', alias='DARKMAP_SEARCH_CURSOR_SECRET')

    # --- risk ---
    risk_ai_weight: float = Field(default=0.5, alias='DARKMAP_RISK_AI_WEIGHT')
    worker_poll_seconds: float = Field(default=2.0, alias='DARKMAP_WORKER_POLL_SECONDS')

    @field_validator('public_page_allowlist', mode='before')
    @classmethod
    def _split(cls, v):
        if v is None or v == '':
            return []
        if isinstance(v, str):
            return [h.strip().lower() for h in v.split(',') if h.strip()]
        return v

    @property
    def ai_enabled(self) -> bool:
        return bool(self.experiential_labs_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
