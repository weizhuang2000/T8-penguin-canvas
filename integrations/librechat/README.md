# LibreChat 外部服务集成

T8 不在 Electron 或主后端进程内打包 MongoDB、Redis 或 LibreChat 服务。
本目录已包含官方 LibreChat `v0.8.8-rc1`（commit
`14d4f2789d8f1d308713f7acd98fab925f8aa74d`）以及 T8 专用桥接补丁。源码许可证保留在
`upstream/LICENSE`，版本锁定记录在 `upstream/UPSTREAM_COMMIT`。

请部署 LibreChat 官方固定版本，并将其地址配置到 `T8_CODEX_SERVICE_URL`。推荐使用本目录
提供的 compose 文件，它只启动 LibreChat API，不会启动 MongoDB、Redis 或 Electron 内的数据库服务：

```bash
cd integrations/librechat
cp .env.t8.example .env.t8
# 编辑 .env.t8，至少设置 MongoDB、Redis、桥接密钥、T8_CODEX_UPSTREAM_URL 和默认模型
docker compose -f docker-compose.t8.yml --env-file .env.t8 up -d --build
docker compose -f docker-compose.t8.yml ps
curl -fsS http://127.0.0.1:3081/health
```

Compose 会先运行一次 `librechat-storage-init`，为 UID/GID `1000:1000` 的 LibreChat
运行用户初始化 `storage/uploads`、`storage/data`、`storage/logs` 和 `storage/images`。其中
`storage/images` 持久化图片附件的最终文件，不应只保存在容器临时层。不要删除该初始化服务，
否则由 root 创建的宿主机目录会导致附件上传时报 `EACCES`。

T8 主后端必须使用同一个 `T8_CODEX_BRIDGE_SECRET`。当 T8 与 LibreChat 都运行在
Docker 中时，它们必须加入同一个外部网络，T8 应设置
`T8_CODEX_SERVICE_URL=http://librechat:3080`；不要使用仅监听宿主机回环地址的
`127.0.0.1:3081`。生产环境将 `DOMAIN_CLIENT` 和
`DOMAIN_SERVER` 改为包含 `/codex` 的 T8 公共地址，例如 `https://t8.example.com/codex`。

LibreChat 服务需要实现以下 T8 桥接约定：

- 接收 `X-T8-Codex-User` 与 `X-T8-Codex-Signature` 请求头；
- 使用 `T8_CODEX_BRIDGE_SECRET` 以 HMAC-SHA256 校验用户身份；
- 将签名载荷中的 `id` 作为唯一用户标识，并禁止公开注册、个人 API Key 和个人 OAuth；
- 使用 T8 提供的 OpenAI-compatible 上游 `/api/codex/v1/chat/completions`；
- 调用 T8 的 `/api/codex/models` 和 `/api/codex/v1/chat/completions` 时附带
  `X-T8-Codex-Internal: T8_CODEX_BRIDGE_SECRET`；
- 模型列表读取 `/api/codex/models`，不要把 API Key 或 Base URL 暴露给浏览器；
- 提供 `/health` 健康检查；容器健康检查和 T8 入口都会使用该端点。

外部 MongoDB、Redis 和文件存储需要由部署环境单独提供并备份。LibreChat 的注册、邮箱/社交登录、
个人 API Key 和账户删除入口已在上游补丁中禁用；所有请求必须经过 T8 身份桥接。
