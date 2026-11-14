"""Compatibility exports delegating to the unified handlers."""

from app.routes import warehouse as canonical
from app.routes._compat import subset

router = subset(canonical.router, ["/scan"])
scan = canonical.scan
