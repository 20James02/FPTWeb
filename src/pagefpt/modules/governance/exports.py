import csv
import io


def safe_cell(value):
    value = str(value)
    return (
        "'" + value if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")) else value
    )


def export_csv(rows: list[dict]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=["id", "status", "created_at", "quote_status"])
    writer.writeheader()
    for row in rows:
        writer.writerow({k: safe_cell(row.get(k, "")) for k in writer.fieldnames})
    return stream.getvalue().encode("utf-8-sig")
