"""Render upstream Codex template into Codex's global skill directory."""

import json
import shutil
from pathlib import Path

source = Path("/tmp/pagefpt-uiux/src/ui-ux-pro-max")
target = Path("/home/thannv3/.codex/skills/ui-ux-pro-max")
if target.exists():
    raise SystemExit("Refusing to overwrite an existing skill")
config = json.loads((source / "templates/platforms/codex.json").read_text())
content = (source / "templates/base/skill-content.md").read_text()
replacements = {
    "TITLE": config["title"],
    "DESCRIPTION": config["description"],
    "SCRIPT_PATH": str(target / "scripts/search.py"),
    "SKILL_OR_WORKFLOW": config["skillOrWorkflow"],
    "QUICK_REFERENCE": "\n" + (source / "templates/base/quick-reference.md").read_text(),
}
for key, value in replacements.items():
    content = content.replace("{{" + key + "}}", value)
assert "{{" not in content, "Unresolved template placeholder"
frontmatter = (
    "---\n"
    + "".join(
        f"{k}: {json.dumps(v, ensure_ascii=False)}\n" for k, v in config["frontmatter"].items()
    )
    + "---\n\n"
)
target.mkdir(parents=True)
(target / "SKILL.md").write_text(frontmatter + content)
for directory in ("scripts", "data"):
    shutil.copytree(source / directory, target / directory)
print(f"Installed ui-ux-pro-max to {target}")
