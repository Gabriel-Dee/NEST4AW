FROM python:3.13-slim
ARG INSTALL_OCR=false
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
COPY backend/pyproject.toml /srv/backend/pyproject.toml
COPY backend/requirements.lock /srv/backend/requirements.lock
COPY backend/app /srv/backend/app
COPY backend/seed /srv/backend/seed
COPY backend/migrations /srv/backend/migrations
COPY docs/schema.sql docs/seed_reference.sql docs/golden.json /srv/docs/
RUN pip install --no-cache-dir -r /srv/backend/requirements.lock && pip install --no-cache-dir /srv/backend && if [ "$INSTALL_OCR" = true ]; then pip install --no-cache-dir 'paddleocr==3.7.0' 'paddlepaddle==3.3.1'; fi
RUN chmod -R a+rX /srv
RUN useradd --create-home --uid 10001 nest && mkdir -p /home/nest/.paddlex && chown nest:nest /home/nest/.paddlex
USER nest
WORKDIR /srv/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
