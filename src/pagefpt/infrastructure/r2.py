import asyncio

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from pagefpt.core.errors import DomainError


class R2Storage:
    def __init__(self, settings):
        self.settings = settings
        self.client = None
        if (
            settings.r2_endpoint
            and settings.r2_access_key.get_secret_value()
            and settings.r2_secret_key.get_secret_value()
            and settings.r2_bucket
        ):
            self.client = boto3.client(
                "s3",
                endpoint_url=settings.r2_endpoint,
                aws_access_key_id=settings.r2_access_key.get_secret_value(),
                aws_secret_access_key=settings.r2_secret_key.get_secret_value(),
                region_name="auto",
                config=Config(
                    signature_version="s3v4",
                    connect_timeout=2,
                    read_timeout=5,
                    retries={"max_attempts": 1},
                ),
            )

    def require(self):
        if self.client is None:
            raise DomainError("STORAGE_UNCONFIGURED", 503)
        return self.client

    async def sign_put(self, key, content_type):
        client = self.require()
        return await asyncio.to_thread(
            client.generate_presigned_url,
            "put_object",
            Params={"Bucket": self.settings.r2_bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=300,
        )

    async def sign_get(self, key):
        client = self.require()
        return await asyncio.to_thread(
            client.generate_presigned_url,
            "get_object",
            Params={"Bucket": self.settings.r2_bucket, "Key": key},
            ExpiresIn=60,
        )

    async def read(self, key, max_bytes=10 * 1024 * 1024):
        client = self.require()

        def fetch():
            head = client.head_object(Bucket=self.settings.r2_bucket, Key=key)
            if head["ContentLength"] > max_bytes:
                raise DomainError("MEDIA_TOO_LARGE", 422)
            response = client.get_object(Bucket=self.settings.r2_bucket, Key=key)
            try:
                data = response["Body"].read(max_bytes + 1)
            finally:
                response["Body"].close()
            if len(data) > max_bytes:
                raise DomainError("MEDIA_TOO_LARGE", 422)
            return data

        try:
            return await asyncio.to_thread(fetch)
        except (ClientError, BotoCoreError) as exc:
            raise DomainError("STORAGE_UNAVAILABLE", 503) from exc

    async def write(self, key, data, content_type, public=False):
        client = self.require()
        bucket = self.settings.r2_public_bucket if public else self.settings.r2_bucket
        if not bucket:
            raise DomainError("PUBLIC_STORAGE_UNCONFIGURED", 503)
        try:
            await asyncio.to_thread(
                client.put_object,
                Bucket=bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                CacheControl="public,max-age=31536000,immutable" if public else "no-store",
            )
        except (ClientError, BotoCoreError) as exc:
            raise DomainError("STORAGE_UNAVAILABLE", 503) from exc

    async def delete(self, key, public=False):
        client = self.require()
        bucket = self.settings.r2_public_bucket if public else self.settings.r2_bucket
        try:
            await asyncio.to_thread(client.delete_object, Bucket=bucket, Key=key)
        except (ClientError, BotoCoreError) as exc:
            raise DomainError("STORAGE_UNAVAILABLE", 503) from exc

    async def delete_prefix(self, prefix):
        if not prefix.startswith("exports/") or not prefix.endswith("/"):
            raise DomainError("INVALID_STORAGE_PREFIX", 422)
        client = self.require()
        try:
            objects = await asyncio.to_thread(
                client.list_objects_v2, Bucket=self.settings.r2_bucket, Prefix=prefix, MaxKeys=100
            )
            keys = [{"Key": row["Key"]} for row in objects.get("Contents", [])]
            if keys:
                result = await asyncio.to_thread(
                    client.delete_objects,
                    Bucket=self.settings.r2_bucket,
                    Delete={"Objects": keys, "Quiet": True},
                )
                if result.get("Errors"):
                    raise DomainError("STORAGE_DELETE_FAILED", 503)
            return bool(objects.get("IsTruncated"))
        except (ClientError, BotoCoreError) as exc:
            raise DomainError("STORAGE_UNAVAILABLE", 503) from exc
