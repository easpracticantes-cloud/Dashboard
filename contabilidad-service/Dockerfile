FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-lock.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data /app/storage

ENV APP_HOST=0.0.0.0
ENV APP_PORT=8787
ENV APP_OPEN_BROWSER=0
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL=sqlite:////app/data/contable.db
ENV STORAGE_ROOT=/app/storage

# Render asignaba $PORT; en Oracle Compose usamos APP_PORT/8787
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import os,urllib.request; p=os.environ.get('PORT','8787'); urllib.request.urlopen(f'http://127.0.0.1:{p}/api/health', timeout=3)"

CMD ["python", "run_web.py"]
