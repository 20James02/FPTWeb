"""Run every isolated browser contract; fail if any contract fails."""

import os
import subprocess
from pathlib import Path


def main():
    files = sorted(Path("tests/contracts").glob("*.mjs"))
    if not files:
        raise SystemExit("No JS contracts found")
    failures = []
    for file in files:
        print(file.name, flush=True)
        if subprocess.run(
            [os.environ.get("PAGEFPT_NODE_BINARY", "node"), str(file)], check=False
        ).returncode:
            failures.append(str(file))
    print(f"{len(files) - len(failures)}/{len(files)} JS contracts passed")
    if failures:
        raise SystemExit("Failed: " + ", ".join(failures))


if __name__ == "__main__":
    main()
