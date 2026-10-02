"""Check source layering and old import paths after the module restructuring."""

import ast
from pathlib import Path

ROOT = Path("src/pagefpt")
LEGACY_DOMAINS = {
    "identity",
    "catalog",
    "pricing",
    "leads",
    "intelligence",
    "abuse",
    "workflow",
    "marketing",
    "integrations",
    "content",
    "media",
    "care",
    "reporting",
    "governance",
    "infra",
}


def main():
    failures = []
    paths = list(ROOT.rglob("*.py"))
    for path in paths:
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.ImportFrom) and node.module:
                names.append(node.module)
            elif isinstance(node, ast.Import):
                names.extend(alias.name for alias in node.names)
            for name in names:
                parts = name.split(".")
                if name.startswith("src.pagefpt") or (
                    len(parts) > 1 and parts[0] == "pagefpt" and parts[1] in LEGACY_DOMAINS
                ):
                    failures.append(f"{path}:{node.lineno}: stale namespace {name}")
                if (
                    path.is_relative_to(ROOT / "core")
                    and name.startswith("pagefpt.")
                    and not name.startswith("pagefpt.core")
                ):
                    failures.append(f"{path}:{node.lineno}: core imports higher layer {name}")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"Architecture imports passed: {len(paths)} Python source files")


if __name__ == "__main__":
    main()
