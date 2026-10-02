"""Export the API schema without network access or reading runtime secrets."""

import json
from pathlib import Path

from pagefpt.application import create_app
from pagefpt.core.config import Settings


def main():
    app = create_app(Settings(environment="test", _env_file=None))
    schema = app.openapi()
    destination = Path("docs/backend/openapi.json")
    destination.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n")
    print(f"Exported {len(schema['paths'])} paths to {destination}")


if __name__ == "__main__":
    main()
