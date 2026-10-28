import argparse
import json
import logging
import signal
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from services.common.config import Settings
from services.common.store import Store
from services.common.bus import RedisBus
from services.common.security import ConfirmationTokens
from services.adapters.registry import Registry
from services.ai.provider import Provider
from services.orchestrator.service import Orchestrator
from services.telemetry.collectors import Collector

logging.basicConfig(level=logging.INFO, format='%(message)s')
log = logging.getLogger('aegis.worker')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--role', choices=['orchestrator', 'ai', 'telemetry', 'outbox'], default='orchestrator')
    args = parser.parse_args()
    settings = Settings()
    settings.validate()
    store, registry = Store(settings.database_url), Registry(settings.adapter_mode)
    engine = Orchestrator(store, registry, Provider(settings.llm_mode), ConfirmationTokens(settings.confirmation_secret))
    bus = RedisBus(settings.redis_url) if settings.redis_url else None
    collector = Collector(registry)
    state = {'running': True, 'last_success': 0}
    class Health(BaseHTTPRequestHandler):
        def do_GET(self):
            ok = self.path == '/health/live' or time.time() - state['last_success'] < 30
            self.send_response(200 if ok else 503)
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok' if ok else 'unavailable', 'service': args.role}).encode())
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(('0.0.0.0', 9000), Health)
    Thread(target=server.serve_forever, daemon=True).start()
    def stop(*args):
        state['running'] = False
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    last_tick = 0
    while state['running']:
        try:
            if args.role == 'orchestrator':
                if time.monotonic() - last_tick > 10:
                    engine.tick()
                    last_tick = time.monotonic()
                worked = engine.run_once({'node.action', 'scenario.launch', 'scenario.abort', 'ticket.resolve', 'baseline.restore'})
                if not worked:
                    time.sleep(0.25)
            elif args.role == 'ai':
                if not engine.run_once({'chat.reply', 'debrief.answer'}):
                    time.sleep(0.25)
            elif args.role == 'outbox':
                if bus:
                    bus.flush(store)
                time.sleep(0.25)
            else:
                with store.transaction() as tx:
                    for client in tx.list('client'):
                        collector.collect(tx, client['id'])
                        if registry.mode == 'live':
                            collector.prometheus(tx, client['id'])
                            collector.opensearch(tx, client['id'])
                time.sleep(2)
            state['last_success'] = time.time()
        except Exception as exc:
            log.error(json.dumps({'event': 'worker.error', 'role': args.role, 'exception': type(exc).__name__}))
            time.sleep(2)
    server.shutdown()

if __name__ == '__main__':
    main()
