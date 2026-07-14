# Charge Karnataka

A map-first EV charging finder for Karnataka with road-distance routing, timed reservations, and mock payments.

## Local development

```bash
npm install
npm run dev
```

The development client runs at `http://127.0.0.1:5173` and proxies the API on port `8787`.

## Production

```bash
npm ci
npm run build
npm start
```

The server honors the `PORT` environment variable and serves both the API and built client. A Render Blueprint is included in `render.yaml`.

Demo credentials: `driver@demo.local` / `demo1234`.

SQLite data is stored on the local filesystem. On a free Render instance it may reset after a restart or redeploy.
