from pagefpt.modules.intelligence.geoip import GeoIP


class CityDatabase:
    def get(self, ip):
        return {
            "country": {"iso_code": "VN"},
            "city": {"names": {"en": "Bien Hoa"}},
            "subdivisions": [{"names": {"en": "Dong Nai"}}],
            "location": {"accuracy_radius": 50},
        }


def test_city_database_exposes_province_but_never_invents_a_ward():
    geo = GeoIP()
    geo.reader = CityDatabase()
    result = geo.lookup("8.8.8.8")
    assert result.get("province") == "Dong Nai"
    assert result["city"] == "Bien Hoa"
    assert result["accuracy_radius"] == 50
    assert "ward" not in result


def test_private_address_has_no_location_even_with_database():
    geo = GeoIP()
    geo.reader = CityDatabase()
    assert geo.lookup("192.168.1.1") == {"status": "unknown", "source": "geoip"}
