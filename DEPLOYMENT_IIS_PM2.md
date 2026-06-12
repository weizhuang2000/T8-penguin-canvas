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

## Troubleshooting `ERR_HTTP2_PROTOCOL_ERROR`

If Chrome reports `net::ERR_HTTP2_PROTOCOL_ERROR` for small API calls such as:

```text
GET https://canvas.chinaemuseum.com/api/status
GET https://canvas.chinaemuseum.com/api/generation-history/items?canvasId=...
```

check the layers in this order on the Windows server:

1. Verify the Node service directly:
   ```powershell
   pm2 status
   pm2 logs t8-penguin-canvas --lines 100
   curl.exe -i http://127.0.0.1:18766/api/status
   ```
   A healthy backend should return HTTP 200 JSON from `127.0.0.1:18766`.

2. Verify IIS/ARR through the public site:
   ```powershell
   curl.exe -i --http1.1 https://canvas.chinaemuseum.com/api/status
   curl.exe -i https://canvas.chinaemuseum.com/api/status
   ```
   If direct Node is healthy but the public HTTPS request fails, the issue is in IIS/ARR/TLS rather than the React app or Express route.

3. Replace the proxy folder `web.config` with this repository's latest `web.config`, then recycle the IIS application pool.

4. If the error only appears over HTTP/2, temporarily disable IIS HTTP/2 while you inspect ARR/TLS:
   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\HTTP\Parameters" -Name EnableHttp2Tls -Value 0 -PropertyType DWord -Force
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\HTTP\Parameters" -Name EnableHttp2Cleartext -Value 0 -PropertyType DWord -Force
   iisreset
   ```
   Re-enable later by setting both values to `1` or deleting the properties, then run `iisreset` again.

5. If IIS returns 502/500, also check that ARR proxy is enabled at the server level in IIS Manager:
   `Server` -> `Application Request Routing Cache` -> `Server Proxy Settings` -> `Enable proxy`.
