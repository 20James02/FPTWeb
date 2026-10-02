import warnings

from fastapi.routing import APIRoute

from pagefpt.application import create_app
from pagefpt.core.config import Settings


def test_api_routes_and_operation_ids_are_unique():
    app = create_app(Settings(environment="test", _env_file=None))
    routes = [route for route in app.routes if isinstance(route, APIRoute)]
    signatures = [(method, route.path) for route in routes for method in route.methods]
    assert len(signatures) == len(set(signatures))
    with warnings.catch_warnings():
        warnings.simplefilter("error", UserWarning)
        schema = app.openapi()
    operation_ids = [
        operation["operationId"]
        for path in schema["paths"].values()
        for operation in path.values()
        if isinstance(operation, dict) and "operationId" in operation
    ]
    assert len(operation_ids) == len(set(operation_ids))
