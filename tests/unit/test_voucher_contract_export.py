from pagefpt.modules.vouchers import routes
from tools.export_frontend_contract import authorization


def test_generated_voucher_contract_describes_financial_permissions_and_mfa():
    published = authorization(routes.publish, "/api/v1/admin/vouchers/{id}/publish")
    assert published["checks"] == [
        {"permission": "marketing.write", "mfa": False},
        {"permission": "pricing.publish", "mfa": True},
    ]
    draft = authorization(routes.create, "/api/v1/admin/vouchers")
    assert draft["checks"] == [{"permission": "marketing.write", "mfa": False}]
    staff = authorization(routes.lead_voucher, "/api/v1/admin/leads/{id}/voucher")
    assert staff["checks"] == [{"permission": "lead.write", "mfa": False}]


def test_short_link_is_public_in_frontend_route_inventory():
    assert authorization(routes.short_link, "/s/{slug}")["caller"] == "public_html"
