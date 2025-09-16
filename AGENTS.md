# Repository Guidelines

## Project Structure & Module Organization
- `backend/` (NestJS + Prisma): API, auth, themes, tags, memos. Prisma schema/migrations in `backend/prisma/`; source in `backend/src/`.
- `frontend/` (React + Vite + Tailwind): UI code under `frontend/src/`, static assets in `frontend/public/`.
- `nginx/`: Reverse proxy for local and containerized setups.
- Root: `docker-compose.yml`, `.env(.example)`, workspace `package.json`, CI under `.github/workflows/`.

## Build, Test, and Development Commands
- Full stack (Docker): `docker-compose up` → UI `http://localhost`, API `http://localhost:3000`.
- Monorepo (npm workspaces):
  - Install: `npm install`
  - Dev (both): `npm run dev`
  - Build: `npm run build`
  - Lint: `npm run lint` / auto-fix: `npm run lint:fix`
  - Format: `npm run format` / check only: `npm run format:check`
  - Tests (backend): `npm run -w backend test`, `test:e2e`, `test:cov`
- Backend only: `cd backend && npm i && npm run start:dev`
- Frontend only: `cd frontend && npm i && npm run dev` (Vite at `:5173`)
- Prisma: `npm run -w backend migration:apply`, `npm run -w backend migration:deploy`, `npx prisma studio`

## Coding Style & Naming Conventions
- Formatting: Prettier; Linting: ESLint. Use the root scripts above.
- TypeScript, 2‑space indent, strict typing preferred.
- Naming: variables/functions `camelCase`; classes/components `PascalCase`.
- React components: `PascalCase.tsx` under `frontend/src/...`.
- NestJS files: kebab‑case by feature (e.g., `memo.controller.ts`, `tag.service.ts`).

## Testing Guidelines
- Backend uses Jest. Unit tests `*.spec.ts` in `backend/src/**`; e2e tests in `backend/test/`.
- Run: `npm run -w backend test`, `test:e2e`, `test:cov`.
- DB: tests rely on PostgreSQL; use Docker or set `DATABASE_URL` to a test DB.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (e.g., `feat: ...`, `fix: ...`, `chore: ...`).
- PRs: clear description, linked issues, test plan; screenshots/GIFs for UI changes.
- Checks: lint/format/tests must pass; include Prisma schema/migration updates when applicable.

## Security & Configuration Tips
- Never commit secrets. Copy `.env.example` → `.env` and fill values (OAuth, DB, admin email).
- After schema changes, run migrations and regenerate the Prisma client.
- PWA is configured via `frontend/vite.config.ts` (`vite-plugin-pwa`); icons live in `frontend/public/`.
