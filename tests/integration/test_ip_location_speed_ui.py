from html.parser import HTMLParser

import pytest


class HintMarkup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hints = []

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if attributes.get("id") == "client-location-status":
            self.hints.append(attributes)


@pytest.mark.asyncio
async def test_speed_pricing_labels_automatic_location_as_an_estimate(client):
    response = await client.get("/do-toc-do")
    assert response.status_code == 200
    markup = HintMarkup()
    markup.feed(response.text)
    assert len(markup.hints) == 1, "Speed pricing needs its own IP estimate status region"
    assert markup.hints[0]["role"] == "status"
    assert "hidden" in markup.hints[0]
