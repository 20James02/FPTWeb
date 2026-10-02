import boto3
import pytest
from botocore.config import Config
from botocore.stub import Stubber

from pagefpt.core.config import Settings
from pagefpt.infrastructure.r2 import R2Storage


@pytest.mark.asyncio
async def test_private_presign_expiry_and_prefix_cleanup():
    storage = R2Storage(Settings(r2_bucket="private-test"))
    storage.client = boto3.client(
        "s3",
        endpoint_url="https://r2.invalid",
        aws_access_key_id="synthetic",
        aws_secret_access_key="synthetic",
        region_name="auto",
        config=Config(
            signature_version="s3v4", connect_timeout=1, read_timeout=1, retries={"max_attempts": 0}
        ),
    )
    url = await storage.sign_get("exports/synthetic/0.csv")
    assert "X-Amz-Expires=60" in url
    with Stubber(storage.client) as stub:
        stub.add_response(
            "list_objects_v2",
            {"Contents": [{"Key": "exports/id/orphan.csv"}], "IsTruncated": False},
            {"Bucket": "private-test", "Prefix": "exports/id/", "MaxKeys": 100},
        )
        stub.add_response(
            "delete_objects",
            {},
            {
                "Bucket": "private-test",
                "Delete": {"Objects": [{"Key": "exports/id/orphan.csv"}], "Quiet": True},
            },
        )
        assert not await storage.delete_prefix("exports/id/")
        stub.assert_no_pending_responses()
