from datetime import datetime, timezone
from typing import Literal, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator

class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Provenance(Strict):
    method: Literal["user_export"] = "user_export"
    source: str = Field(min_length=1, max_length=500)
    authorization: str = Field(min_length=8, max_length=1000)
    collected_at: datetime
    source_url: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("collected_at")
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None:
            raise ValueError("timestamp must include timezone")
        return value.astimezone(timezone.utc)

class Media(Strict):
    kind: Literal["image", "video", "audio"]
    url: Optional[str] = Field(default=None, max_length=2000)
    mime_type: Optional[str] = None
    width: Optional[int] = Field(default=None, ge=1)
    height: Optional[int] = Field(default=None, ge=1)
    duration_seconds: Optional[float] = Field(default=None, ge=0)
    # Authorized human/upstream observations; never presented as image inference.
    observed_logos: list[str] = Field(default_factory=list, max_length=20)

class Entity(Strict):
    external_id: str = Field(min_length=1, max_length=200)
    kind: Literal["profile", "post", "reel", "comment"]
    account: str = Field(min_length=1, max_length=100)
    parent_id: Optional[str] = Field(default=None, max_length=200)
    display_name: str = Field(default="", max_length=200)
    bio: str = Field(default="", max_length=5000)
    caption: str = Field(default="", max_length=20000)
    mentions: list[str] = Field(default_factory=list, max_length=100)
    hashtags: list[str] = Field(default_factory=list, max_length=100)
    urls: list[str] = Field(default_factory=list, max_length=100)
    timestamp: Optional[datetime] = None
    engagement: dict[str, int] = Field(default_factory=dict)
    media: list[Media] = Field(default_factory=list, max_length=20)
    provenance: Provenance

    @field_validator("account")
    @classmethod
    def account_case(cls, value):
        value = value.strip().lstrip("@").lower()
        if not value:
            raise ValueError("empty account")
        return value

    @field_validator("engagement")
    @classmethod
    def counts(cls, value):
        if any(v < 0 for v in value.values()):
            raise ValueError("engagement must be nonnegative")
        return value

    @field_validator("timestamp")
    @classmethod
    def aware(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("timestamp must include timezone")
        return value

class Brand(Strict):
    name: str = Field(min_length=2, max_length=100)
    official_accounts: list[str] = Field(default_factory=list, max_length=100)
    official_domains: list[str] = Field(default_factory=list, max_length=100)

class ImportBatch(Strict):
    brand: Brand
    entities: list[Entity] = Field(min_length=1, max_length=500)

Category = Literal["impersonation", "counterfeit", "scam", "suspicious_naming", "logo_misuse", "risky_urls", "giveaway_payment", "fake_support", "credential_harvesting", "coordinated_abuse"]

class Finding(Strict):
    category: Category
    score: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    evidence: list[str] = Field(min_length=1, max_length=10)
    explanation: str = Field(min_length=1, max_length=2000)

class Assessment(Strict):
    findings: list[Finding] = Field(max_length=10)
    limitations: list[str] = Field(max_length=20)
