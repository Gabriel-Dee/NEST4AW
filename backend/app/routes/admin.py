"""Compatibility exports delegating to the unified handlers."""

from app.routes import accounts as canonical
from app.routes._compat import subset

router = subset(canonical.router, ["/admin/users", "/admin/users/{id}"])
create_user = canonical.create_user
list_users = canonical.list_users
patch_user = canonical.patch_user
