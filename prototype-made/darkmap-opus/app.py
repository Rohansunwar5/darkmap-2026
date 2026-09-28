'''Vercel entry point for the Darkmap FastAPI application.'''
import os

# Vercel Functions have a read-only application bundle and a writable /tmp directory.
# A hosted PostgreSQL URL should override this for durable production investigations.
if os.getenv('VERCEL'):
    os.environ.setdefault('DARKMAP_ENV', 'production')
    os.environ.setdefault('DARKMAP_DATABASE_URL', 'sqlite:////tmp/darkmap.db')

from darkmap.api import app  # noqa: E402,F401
