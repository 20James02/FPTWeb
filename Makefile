.PHONY: serve check test schema build
serve:
	uv run uvicorn app:app --host 127.0.0.1 --port 8000 --no-access-log
check:
	uv run ruff check src tests tools
	uv run ruff format --check src tests tools
	uv run mypy src
	uv run python tools/check_architecture.py
test:
	uv run pytest -q
schema:
	uv run python tools/export_openapi.py
build:
	uv build
	uv run python tools/verify_wheel.py
