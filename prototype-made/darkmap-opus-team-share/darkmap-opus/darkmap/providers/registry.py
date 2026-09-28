from typing import Any, Dict, List, Optional, Type

from sqlalchemy.orm import Session

from .base import IngestionProvider, ProviderError
from .bright_data_instagram import BrightDataInstagramProvider
from .export_file import ExportFileProvider
from .instagram_graph import InstagramGraphProvider
from .public_page import PublicPageProvider

_REGISTRY: Dict[str, Type[IngestionProvider]] = {
    ExportFileProvider.name: ExportFileProvider,
    BrightDataInstagramProvider.name: BrightDataInstagramProvider,
    InstagramGraphProvider.name: InstagramGraphProvider,
    PublicPageProvider.name: PublicPageProvider,
}


def register(cls: Type[IngestionProvider]) -> None:
    _REGISTRY[cls.name] = cls


def available_providers() -> List[Dict[str, str]]:
    return [{'name': n, 'lawful_basis': c.lawful_basis} for n, c in sorted(_REGISTRY.items())]


def get_provider(name: str, session: Session,
                 params: Optional[Dict[str, Any]] = None) -> IngestionProvider:
    cls = _REGISTRY.get(name)
    if cls is None:
        raise ProviderError(f'unknown ingestion provider "{name}"; '
                            f'available: {sorted(_REGISTRY)}')
    return cls(session, params or {})
