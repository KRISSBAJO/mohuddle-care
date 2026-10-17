FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir faster-whisper==1.2.1 numpy==2.5.3
RUN useradd --uid 10001 --create-home speech && mkdir -p /models/whisper && chown -R speech:speech /models
WORKDIR /app
COPY whisper_worker.py /app/whisper_worker.py
COPY hosted/service.py hosted/bootstrap.py /app/hosted/
USER speech
ENV HF_HUB_DISABLE_TELEMETRY=1 PYTHONUNBUFFERED=1
CMD ["sh", "-c", "python hosted/bootstrap.py && exec python hosted/service.py"]
