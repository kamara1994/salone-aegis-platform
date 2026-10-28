"""Transactional outbox to Redis Streams. SQL remains authoritative for replay.
At-least-once delivery: consumers deduplicate by seq. No stream trimming in v1.
"""

class RedisBus:
    def __init__(self, url):
        import redis
        self.redis = redis.Redis.from_url(url, decode_responses=True, socket_timeout=5)

    def flush(self, store):
        with store.transaction() as tx:
            rows = tx.execute('SELECT seq,data FROM events WHERE published=0 ORDER BY seq LIMIT 100').fetchall()
            for row in rows:
                # Explicit stream IDs make retries after a crash idempotent.
                stream_id = f"{row['seq']}-0"
                existing = self.redis.xrange('aegis:events', stream_id, stream_id)
                if not existing:
                    self.redis.xadd('aegis:events', {'event': row['data']}, id=stream_id)
                tx.execute('UPDATE events SET published=1 WHERE seq=?', (row['seq'],))
            return len(rows)

    def wait(self, last_id, timeout_ms=1000):
        return self.redis.xread({'aegis:events': last_id}, block=timeout_ms, count=100)
