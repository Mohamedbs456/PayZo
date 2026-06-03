FROM python:3.11-slim
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl libgomp1 \
 && rm -rf /var/lib/apt/lists/*
# libgomp1 is the OpenMP runtime that LightGBM (and CatBoost) link against —
# the slim image doesn't ship it by default. Without it the dlopen of
# lightgbm.so fails at import time and the FastAPI lifespan crashes.

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Production code only — data_generation/, train.py, promote.py and data/
# are NOT shipped. candidates.py IS shipped (TierLoader lives there).
COPY app/ app/
COPY stub/ stub/
COPY config/ config/
COPY feature_engineering.py orchestrator.py candidates.py \
     tier1_main_model.py tier2_fallback_model.py tier3_rule_firewall.py \
     ./

RUN mkdir -p artifacts

EXPOSE 5000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
