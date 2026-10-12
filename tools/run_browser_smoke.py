"""Start and stop an isolated SQL/Auth fixture for the Chromium workflow smoke."""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    env = dict(os.environ)
    env["PYTHONPATH"] = "src:."
    env["PAGEFPT_QA_ORIGIN"] = origin
    output = Path(".local/qa/audit-upgrades")
    output.mkdir(parents=True, exist_ok=True)
    with (output / "fixture.log").open("w") as log:
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "tests.e2e.accounts_analytics_server:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            for _ in range(150):
                if server.poll() is not None:
                    raise RuntimeError(
                        "Fixture failed to start; inspect .local/qa/audit-upgrades/fixture.log"
                    )
                try:
                    with urlopen(origin + "/admin/login", timeout=1) as response:
                        if response.status == 200:
                            break
                except (URLError, TimeoutError):
                    time.sleep(0.2)
            else:
                raise RuntimeError("Fixture startup timed out")
            result = subprocess.run(
                [
                    env.get("PAGEFPT_NODE_BINARY", "node"),
                    env.get("PAGEFPT_QA_SCRIPT", "tests/e2e/audit_workbench.cjs"),
                ],
                env=env,
                check=False,
            )
            if result.returncode:
                raise SystemExit(result.returncode)
        finally:
            server.terminate()
            try:
                server.wait(timeout=15)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == "__main__":
    main()
