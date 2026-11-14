"""Route subsets for older module imports; no duplicate business logic or mounts."""

from fastapi import APIRouter


def subset(router, paths):
    result = APIRouter()
    result.routes.extend(route for route in router.routes if route.path in paths)
    return result
