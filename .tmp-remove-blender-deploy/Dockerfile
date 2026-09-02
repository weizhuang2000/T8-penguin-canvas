FROM node:22-bookworm-slim AS frontend-build

ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    NPM_CONFIG_MAXSOCKETS=1 \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=2000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=30000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    NPM_CONFIG_MAXSOCKETS=1 \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=2000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=30000

ENV HOST=0.0.0.0 \
    PORT=18766 \
    NODE_ENV=production \
    T8PC_PACKAGED=1 \
    T8PC_FRONTEND_DIST=/app/dist \
    T8PC_USER_DATA=/app/userdata \
    HOME=/app/userdata \
    T8_PPT_PYTHON=/opt/ppt-venv/bin/python

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl docker.io ffmpeg python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY integrations/ppt-web/backend/requirements.txt /tmp/ppt-requirements.txt
RUN python3 -m venv /opt/ppt-venv \
  && /opt/ppt-venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/ppt-venv/bin/pip install --no-cache-dir -r /tmp/ppt-requirements.txt \
  && rm -f /tmp/ppt-requirements.txt

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm install --omit=dev --no-audit --no-fund

COPY backend/src ./backend/src
COPY integrations/ppt-web ./integrations/ppt-web
COPY shared ./shared
COPY tools/parsehub-bridge ./tools/parsehub-bridge
COPY --from=frontend-build /app/dist ./dist

EXPOSE 18766
VOLUME ["/app/userdata"]

CMD ["node", "backend/src/server.js"]
