"""Verify installed-package layout and ASGI health/static endpoints from a built wheel."""

import os
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def main():
    wheels = sorted(Path("dist").glob("*.whl"))
    if len(wheels) != 1:
        raise SystemExit("Expected exactly one wheel in dist/")
    with tempfile.TemporaryDirectory(prefix="pagefpt-wheel-") as folder:
        with zipfile.ZipFile(wheels[0]) as wheel:
            for source in Path("src/pagefpt").rglob("*"):
                if (
                    source.is_file()
                    and "__pycache__" not in source.parts
                    and source.suffix != ".pyc"
                ):
                    member = str(source.relative_to("src"))
                    if member not in wheel.namelist() or wheel.read(member) != source.read_bytes():
                        raise SystemExit(f"Wheel differs from current package source: {source}")
            wheel.extractall(folder)
        script = """
import asyncio
from pathlib import Path
import httpx
import pagefpt.application
from pagefpt.application import create_app
from pagefpt.core.config import Settings
assert Path(pagefpt.application.__file__).resolve().is_relative_to(Path.cwd())
package = Path(pagefpt.application.__file__).parent
assert (package / "templates/client/home.html").exists()
assert (package / "static/js/client/api.js").exists()
async def verify():
    app = create_app(Settings(environment="test", _env_file=None))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://wheel") as client:
            assert (await client.get("/health/live")).json() == {"status":"alive"}
            assert "pendingLead" in (await client.get("/static/js/client/api.js")).text
    print("Wheel smoke passed: isolated package import, templates, static assets, ASGI health")
asyncio.run(verify())
"""
        environment = os.environ.copy()
        environment["PYTHONPATH"] = folder
        subprocess.run([sys.executable, "-c", script], cwd=folder, env=environment, check=True)


if __name__ == "__main__":
    main()
