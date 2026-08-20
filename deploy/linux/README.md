# Linux ECS / 宝塔部署

这套配置只面向第二台 Linux ECS，默认不会停止、修改或覆盖 Windows 生产站。宝塔面板地址只作为管理入口，不要把应用绑定到 8888 端口。

## 准备

服务器需要 Docker、Docker Compose、Nginx 和受限 sudo/SSH 账号：

```bash
sudo install -d -m 750 /srv/t8-penguin-canvas/userdata /srv/t8-alist
cd /srv/t8-penguin-canvas/app
git clone <approved-source-or-private-repository> .
cp deploy/linux/.env.production.example deploy/linux/.env.production
chmod 600 deploy/linux/.env.production
```

填写旧机 MySQL 私网地址、最小权限账户和与 `des.chinaemuseum.com` 相同的 `JWT_SECRET`。生产值不得写入 Compose、Git 或镜像。

## 启动预发布实例

先在宝塔创建 `canvas-new.chinaemuseum.com` 的 DNS/A 记录和证书，再把 `nginx/canvas-new.conf` 中的证书路径替换为宝塔实际路径：

```bash
cd /srv/t8-penguin-canvas/app/deploy/linux
docker compose -f docker-compose.production.yml build --pull
docker compose -f docker-compose.production.yml up -d t8-penguin-canvas
curl --fail http://127.0.0.1:18766/api/status
```

AList 完成同一百度账号授权、挂载 `/百度网盘` 和专用 WebDAV 用户后再启动：

```bash
docker compose -f docker-compose.production.yml --profile baidu up -d alist
```

T8 的 WebDAV 地址使用 `http://127.0.0.1:5244/dav/百度网盘`。预发布阶段保持输出空间为 `primary`，只做读取验收。

## 数据盘点与迁移

先在旧机只读导出目录运行盘点，生成数量、大小和 SHA-256 清单：

```bash
node scripts/data-migration.cjs audit --root /path/to/old-export --out old-audit.json
```

新机先做 dry-run，确认报告后才加 `--apply`；最终冻结窗口内再加 `--overwrite` 同步增量。脚本不会删除目标文件，也不会迁移 `auth_sessions.json`：

```bash
node scripts/data-migration.cjs migrate \
  --source /path/to/old-export \
  --target /srv/t8-penguin-canvas/userdata \
  --container-userdata /app/userdata \
  --webdav-url http://127.0.0.1:5244/dav/%E7%99%BE%E5%BA%A6%E7%BD%91%E7%9B%98
```

迁移会转换已知 Windows 路径、百度 WebDAV 地址和旧站本地媒体绝对 URL；网盘文件只读对账，不移动或覆盖。

## 验收、切换与回滚

验收 `/api/status`、直接登录、SSO、角色权限、旧画布、历史、网盘图片和大视频 Range 播放。确认清单、日志和快照后，冻结旧站写入 10–30 分钟，执行最终增量迁移，启动新容器并完成冒烟测试，再切换正式域名 DNS。

失败时只恢复 DNS 到旧 Windows 站；旧 PM2/IIS、旧数据和旧百度网盘索引均保留不动。
