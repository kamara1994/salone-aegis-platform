FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home aegis
COPY services services
COPY scenarios scenarios
COPY contracts contracts
COPY scripts scripts
COPY infra/alembic infra/alembic
COPY infra/alembic.ini infra/alembic.ini
USER aegis
EXPOSE 8000
CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--ws-max-size", "20000"]
