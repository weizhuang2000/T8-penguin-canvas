# IIS + PM2 Deployment

## Server Layout

- App directory: `C:\wwwroot\expo-AI-CanvasPro`
- IIS reverse proxy directory: `C:\wwwroot\expo-AI-CanvasPro-proxy`
- Runtime data directory: `C:\zhenzhen`
- Public domain: `canvas.chinaemuseum.com`
- Node service: `http://127.0.0.1:18766`

## Deploy

```powershell
cd C:\wwwroot\expo-AI-CanvasPro
npm install
npm run build

New-Item -ItemType Directory -Force C:\zhenzhen\logs
pm2 start ecosystem.config.cjs
pm2 save
```

Copy `web.config` to:

```text
C:\wwwroot\expo-AI-CanvasPro-proxy\web.config
```

## Replace Old Canvas

1. Stop old PM2 app:
   ```powershell
   pm2 stop ai-canvaspro
   pm2 delete ai-canvaspro
   ```
2. Put this project in `C:\wwwroot\expo-AI-CanvasPro`.
3. Keep the IIS site physical path as `C:\wwwroot\expo-AI-CanvasPro-proxy`.
4. Replace the proxy folder `web.config` with this project's `web.config`.
5. Start the new PM2 app with `pm2 start ecosystem.config.cjs`.

## Environment Notes

- `JWT_SECRET` must be exactly the same value as the design management system.
- If MySQL runs in Docker and PM2 runs on the Windows host, keep `MYSQL_HOST=127.0.0.1` only when port 3306 is published to the host.
- If PM2 runs in a container on the same Docker network, use `MYSQL_HOST=design_team_mysql`.
- SSO jump URL:
  ```text
  https://canvas.chinaemuseum.com/?sso_token=<design-team-jwt>
  ```
