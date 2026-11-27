FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.10 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    # The venv lives outside /code so the dev bind mount doesn't hide it.
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

RUN useradd --create-home --uid 1000 app \
    && mkdir /code /opt/venv \
    && chown app:app /code /opt/venv
USER app
WORKDIR /code

# DEV=true installs the dev dependency group (pytest, ruff). Production images use the default.
ARG DEV=false
COPY --chown=app:app pyproject.toml uv.lock ./
RUN if [ "$DEV" = "true" ]; then uv sync --frozen; else uv sync --frozen --no-dev; fi

COPY --chown=app:app . .

EXPOSE 8000
CMD ["gunicorn", "config.wsgi", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
