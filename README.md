# Pin Code Cafe DIGIPIN Portal

A focused web portal for creating a DIGIPIN from Indian latitude/longitude coordinates and decoding a DIGIPIN back to its grid-cell center.

## Development

```bash
npm install
npm run dev
```

The app uses `http://localhost:5000/api` by default. To point it at another DIGIPIN API, copy `.env.example` to `.env.local` and set:

```env
VITE_API_BASE_URL=https://example.com/api
```

## Production

```bash
npm run build
npm run preview
```

The static production output is written to `dist/`.

## API compatibility

The portal targets DIGIPIN API v2 endpoints:

- `POST /digipin/encode`
- `POST /digipin/decode`

Coordinates are validated against the supported grid (latitude `2.5` to `38.5`, longitude `63.5` to `99.5`). DIGIPIN values use exactly 10 characters from `23456789CJKLMPFT`.

## Repositories

This UI is intentionally maintained separately from the DIGIPIN API. Configure the backend URL through `VITE_API_BASE_URL` and keep API changes in the backend repository.

