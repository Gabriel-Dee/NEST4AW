"""Compatibility exports delegating to the unified handlers."""

from app.routes import clients as canonical
from app.routes._compat import subset

router = subset(canonical.router, ["/me/profile", "/me/visits"])
profile = canonical.profile
visits = canonical.visits
