# Butor v2

Browser-based 3D wardrobe designer — **v2 rewrite in progress** on this branch. The specification is in
[docs/v2](docs/v2/README.md); work follows its [roadmap](docs/v2/11-roadmap.md). v1 lives on `main`.

## Develop

```bash
npm install
npm run dev            # app on http://localhost:5173 (API on 8787, proxied under /api)
HOST=0.0.0.0 npm run dev   # also reachable from other devices on the LAN
```

## Check

```bash
npm run check          # typecheck + lint (incl. module boundaries) + unit tests
npm run test:e2e       # Playwright on localhost and on an insecure http origin (butor.test)
```

## Run in production

```bash
npm run build && npm start   # serves the app and the API on http://127.0.0.1:4173 (PORT, HOST to change)
```

## Layout

See [docs/v2/02-architecture.md](docs/v2/02-architecture.md). Module boundaries are enforced by
`dependency-cruiser`: `src/core` is pure TypeScript (zod only) and is shared with the server.
