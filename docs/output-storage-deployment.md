# 第二台 ECS 输出存储节点部署

第一台 ECS 继续运行完整 T8 后端，并保存设置、用户权限、历史记录和文件索引。第二台 ECS 只运行存储节点，不需要部署前端或数据库。

## 1. 准备目录与 Token

在第二台 ECS 创建独立系统用户和存储目录，并生成至少 32 字节的随机 Token。不要把 Token 写入仓库。

存储节点使用以下环境变量：

```text
T8_STORAGE_ROOT=/srv/t8-output
T8_STORAGE_TOKEN=<随机 Token>
T8_STORAGE_HOST=127.0.0.1
T8_STORAGE_PORT=18768
T8_STORAGE_MAX_BYTES=5368709120
```

安装后端依赖并启动：

```bash
cd backend
npm install --omit=dev
npm run storage-node
```

生产环境建议创建 systemd 服务，把上述变量放在权限为 `600` 的 EnvironmentFile 中，并设置自动重启。存储目录只授予该服务用户读写权限。

## 2. 配置 HTTPS 反向代理

存储节点默认只监听 `127.0.0.1:18768`，由 Nginx 或 Caddy 提供 HTTPS。Nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name storage.example.com;

    client_max_body_size 5g;
    proxy_request_buffering off;
    proxy_read_timeout 1800s;
    proxy_send_timeout 1800s;

    location / {
        proxy_pass http://127.0.0.1:18768;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

为域名配置有效证书，并在安全组/防火墙中仅允许第一台 ECS 访问 443。不要直接暴露 18768 端口。

## 3. 在第一台 ECS 启用

1. 打开“API Key 设置 → 输出保存空间”。
2. 填写第二台 ECS 的 HTTPS 地址与同一个 Token，开启该空间。
3. 点击“测试连接”，确认显示磁盘可用容量。
4. 保存设置，再把“当前保存空间”切换到第二台 ECS。

切换只影响新生成文件。旧文件继续留在第一台 ECS，但会与第二台 ECS 文件一起出现在历史生成中。远端写入失败时，新文件会保存在第一台 ECS，并在历史信息中显示回落状态。

“对账文件”会扫描第二台 ECS 上的已有文件并补入中央索引；它不会移动或覆盖文件。

## 4. 运维检查

- 定期备份第一台 ECS 的 `data/generation_history.json` 和 `data/output_storage_index.json`。
- 同时备份两台 ECS 的输出目录；中央索引不是文件内容的副本。
- 大视频播放依赖 HTTPS 代理保留 Range 请求，部署后应测试拖动播放进度。
- Token 泄露时，在第二台 ECS 更新环境变量并重启，再在第一台 ECS 设置中覆盖 Token。

## 5. 百度网盘作为输出空间（AList WebDAV）

百度网盘 VIP 不会直接提供 WebDAV 地址。需要在第一台 ECS 部署 AList，并在 AList 中绑定百度网盘账号。推荐让 AList 只监听本机：

```bash
docker run -d \
  --name alist \
  --restart unless-stopped \
  -p 127.0.0.1:5244:5244 \
  -v /opt/alist:/opt/alist/data \
  xhofe/alist:latest
```

在 AList 管理界面完成以下配置：

1. 添加百度网盘存储并挂载到 `/百度网盘`，按 AList 当前版本的登录说明完成百度账号授权。
2. 在百度网盘中创建 `T8PenguinCanvas` 目录。
3. 创建专用 AList 用户，只授予百度网盘挂载和 `T8PenguinCanvas` 目录的读写权限；不要让 T8 使用 AList 管理员账号。
4. 不要把 5244 端口开放到公网；主后端通过回环地址访问。

然后在 T8 的“API Key 设置 → 云端上传目标 → 百度网盘”填写：

```text
WebDAV 地址：http://127.0.0.1:5244/dav/百度网盘
用户名：AList 专用用户名
密码：AList 专用用户密码或令牌
网盘目录：/T8PenguinCanvas
```

开启百度网盘目标并点击配置检查。保存设置后，“输出保存空间”会自动出现“百度网盘”，无需再次填写 WebDAV 凭据。选择它后：

- 新文件写入 `/T8PenguinCanvas/output/`。
- “对账文件”扫描整个 `/T8PenguinCanvas`，旧媒体进入管理员可见的“未归档”历史。
- 浏览器仍只使用 `/files/output/*`，WebDAV 用户名和密码不会发给前端。
- AList 或百度网盘不可用时，新生成文件回落第一台 ECS。

首次启用后应验证一张图片和一个大视频，包括历史预览、下载、视频拖动进度、再次生成和彻底删除。AList WebDAV 必须正确支持 Range 请求，否则大视频无法正常跳转播放位置。
