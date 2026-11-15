"""Compatibility exports delegating to the unified handlers."""

from app.routes import warehouse as canonical
from app.routes._compat import subset

router = subset(canonical.router, ["/floor/arrive", "/floor/board", "/sessions/{session_id}"])
arrive = canonical.arrive
get_session = canonical.session
board = canonical.board
