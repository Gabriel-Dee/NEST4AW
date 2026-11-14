from fastapi import Request


def connection(request: Request):
    # A route, including its authorization dependency, shares one transaction.
    with request.app.state.pool.connection() as conn:
        yield conn
