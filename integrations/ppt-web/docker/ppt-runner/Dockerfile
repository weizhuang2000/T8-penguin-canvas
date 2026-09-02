# Per-job PPT generation image: Node 22, Python 3.11, Codex CLI and ppt-master.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    python3-pip \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    poppler-utils \
    fonts-noto-cjk \
    fonts-noto-cjk-extra \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry "${NPM_REGISTRY}" \
    && npm install -g @openai/codex

ARG PPT_MASTER_REF=main
ARG PPT_MASTER_ARCHIVE=https://codeload.github.com/hugohe3/ppt-master/tar.gz
RUN mkdir -p /opt/ppt-master \
    && curl -fL --retry 3 "${PPT_MASTER_ARCHIVE}/${PPT_MASTER_REF}" \
      | tar -xz --strip-components=1 -C /opt/ppt-master

ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
RUN pip3 install --break-system-packages --no-cache-dir --index-url "${PIP_INDEX_URL}" \
    "python-pptx>=0.6.21" \
    "edge-tts>=7.2.8" \
    "cairosvg>=2.7" \
    "Pillow>=10.0" \
    "requests>=2.31" \
    "flask>=3.0" \
    "flask-cors>=4.0" \
    "watchdog>=4.0" \
    "beautifulsoup4>=4.12" \
    "lxml>=5.0" \
    "pandas>=2.0" \
    "openpyxl>=3.1" \
    "python-docx>=1.1" \
    "pypdf>=4.0"

COPY docker/ppt-runner/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    # ppt-master occasionally falls back to its cwd when a generated command
    # omits --dir. Keep that fallback inside the bind-mounted job workspace
    # so artifacts never disappear in the ephemeral image layer.
    && rm -rf /opt/ppt-master/projects \
    && ln -s /work/projects /opt/ppt-master/projects \
    && useradd --create-home --uid 1001 --shell /bin/bash codex \
    && chown -R codex:codex /opt/ppt-master

WORKDIR /opt/ppt-master
USER codex
ENTRYPOINT ["/entrypoint.sh"]
HEALTHCHECK NONE
