"""Private S3/MinIO objects. Object references are tenant-prefixed; no public ACLs."""
import hashlib
from pathlib import Path
from uuid import UUID
from services.adapters.live import Vault
from services.common.store import uid
from .service import append

class ObjectStore:
    def __init__(self):
        import boto3
        self.config = Vault().credentials('minio')
        if not self.config['url'].startswith('https://'):
            raise ValueError('Object storage requires TLS')
        self.client = boto3.client('s3', endpoint_url=self.config['url'],
                                  aws_access_key_id=self.config['access_key_id'],
                                  aws_secret_access_key=self.config['secret_access_key'])

    def upload(self, tx, client_id, ticket_id, path, kind, actor):
        UUID(client_id)
        tx.get('ticket', ticket_id, client_id)
        if kind not in ('recording', 'packet_capture', 'export'):
            raise ValueError('Unsupported evidence attachment kind')
        path = Path(path)
        with path.open('rb') as file:
            digest = hashlib.file_digest(file, 'sha256').hexdigest()
        key = f'{client_id}/{ticket_id}/{uid()}'
        self.client.upload_file(str(path), self.config['bucket'], key,
                                ExtraArgs={'ContentType': 'application/octet-stream'})
        return append(tx, client_id, ticket_id, 'attachment.' + kind,
                      {'object_key': key, 'sha256': digest, 'size_bytes': path.stat().st_size}, actor)
