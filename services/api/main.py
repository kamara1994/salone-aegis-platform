import logging
import os
from .app import create_app
logging.basicConfig(level=logging.INFO, format='%(message)s')
app = create_app()
if os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT'):
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    trace.set_tracer_provider(TracerProvider())
    trace.get_tracer_provider().add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    FastAPIInstrumentor.instrument_app(app)
