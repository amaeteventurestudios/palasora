# FastAPI editorial API + worker (same image, different command). Multi-arch.
FROM python:3.11.15-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN useradd -r -u 10001 palavva
WORKDIR /app
COPY services/editorial/requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY services/editorial/palavva_editorial ./palavva_editorial
# Shared with the web app: locale registry (machine-translation gates) and boundary files (area names).
COPY apps/web/lib/i18n/registry.json ./shared/lib/i18n/registry.json
COPY apps/web/public/geo ./shared/public/geo
RUN mkdir -p /data/run && chown -R palavva /data
USER palavva
ENV PALAVVA_DATA_DIR=/data PALAVVA_SHARED_DIR=/app/shared
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1
CMD ["python", "-m", "uvicorn", "palavva_editorial.api:app", "--host", "0.0.0.0", "--port", "8000"]
