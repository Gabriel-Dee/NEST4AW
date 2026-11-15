"""Compatibility exports delegating to the unified handlers."""

from app.routes import warehouse as canonical
from app.routes._compat import subset

router = subset(canonical.router, ["/cart", "/cart/lines", "/cart/lines/{product_id}"])
get_cart = canonical.cart
add_line = canonical.add
delete_line = canonical.remove
