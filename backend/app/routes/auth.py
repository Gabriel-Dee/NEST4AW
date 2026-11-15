"""Compatibility exports delegating to the unified handlers."""

from app.routes import accounts as canonical
from app.routes._compat import subset

router = subset(canonical.router, ["/auth/login", "/auth/me", "/auth/change-password"])
login = canonical.login
me = canonical.me
change_password = canonical.change_password
