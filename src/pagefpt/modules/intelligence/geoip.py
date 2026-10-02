import ipaddress
from functools import lru_cache

import maxminddb


class GeoIP:
    def __init__(self, path=""):
        self.reader = maxminddb.open_database(path) if path else None
        self.lookup = lru_cache(maxsize=1024)(self._lookup)

    def _lookup(self, ip):
        try:
            address = ipaddress.ip_address(ip)
            if not address.is_global or not self.reader:
                return {"status": "unknown", "source": "geoip"}
            from typing import Any

            data: Any = self.reader.get(str(address)) or {}
            if not isinstance(data, dict):
                return {"status": "unknown", "source": "geoip"}
            return {
                "status": "inferred" if data else "unknown",
                "source": "geoip",
                "country": data.get("country", {}).get("iso_code"),
                "city": data.get("city", {}).get("names", {}).get("en"),
                "accuracy_radius": data.get("location", {}).get("accuracy_radius"),
                "asn": data.get("autonomous_system_number"),
                "isp": data.get("autonomous_system_organization"),
            }
        except (ValueError, TypeError):
            return {"status": "unknown", "source": "geoip"}

    def close(self):
        if self.reader:
            self.reader.close()
