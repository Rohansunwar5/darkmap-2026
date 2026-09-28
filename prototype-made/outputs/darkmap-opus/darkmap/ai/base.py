'''Swappable AI analysis provider interface.'''
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class AnalysisResult:
    available: bool
    overall_score: float = 0.0
    category_scores: Dict[str, float] = field(default_factory=dict)
    evidence: List[Dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    limitations: List[str] = field(default_factory=list)
    recommended_action: Optional[str] = None
    summary: str = ''
    model: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


class AnalysisProvider:
    name = 'base'

    def analyze(self, dossier: Dict[str, Any]) -> AnalysisResult:
        raise NotImplementedError


class NullAnalysisProvider(AnalysisProvider):
    '''Used when no API key is configured. Heuristics still run.'''

    name = 'null'

    def __init__(self, reason: str = 'ai_provider_not_configured'):
        self.reason = reason

    def analyze(self, dossier: Dict[str, Any]) -> AnalysisResult:
        return AnalysisResult(available=False, limitations=[self.reason], error=self.reason)
