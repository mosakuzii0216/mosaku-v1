# Repository Guidelines

## Project Structure & Module Organization
- `backend/` (NestJS + Prisma): API, auth, themes, tags, memos. Prisma schema/migrations in `backend/prisma/`.
- `frontend/` (React + Vite + Tailwind): UI code under `frontend/src/`, static assets in `frontend/public/`.
- `nginx/`: Reverse proxy for local and containerized setups.
- Root: `docker-compose.yml`, `.env(.example)`, repo-level docs.

## Build, Test, and Development Commands
- Run full stack (Docker): `docker-compose up` → UI `http://localhost`, API `http://localhost:3000`.
- Monorepo root (npm workspaces):
  - Install all: `npm install`
  - Build all: `npm run build`
  - Lint all: `npm run lint`
  - Test backend: `npm run test` (frontend has no tests by default)
  - Dev (both): `npm run dev` (backend + frontend並行起動)
- Backend only: `cd backend && npm i && npm run start:dev`; tests: `npm run test`, e2e: `npm run test:e2e`.
- Prisma ops: `npm run migration:apply`, `npm run migration:deploy`, `npx prisma studio`.
- Frontend only: `cd frontend && npm i && npm run dev` (Vite at `:5173`). Build: `npm run build`; preview: `npm run preview`.

## Coding Style & Naming Conventions
- Formatting: Prettier; linting: ESLint. Run `npm run lint` in each package.
- TypeScript: 2‑space indent, strict typing. Variables/functions `camelCase`; classes/components `PascalCase`.
- React components: `PascalCase.tsx` under `frontend/src/...`.
- NestJS files: kebab‑case by feature (e.g., `memo.controller.ts`, `tag.service.ts`).

## Testing Guidelines
- Framework: Jest (backend). Unit tests `*.spec.ts` under `backend/src/**`; e2e tests in `backend/test/`.
- Commands: `npm run test`, `npm run test:e2e`, `npm run test:cov` before PRs.
- Prefer testing services and controllers; add e2e for critical flows.

## Commit & Pull Request Guidelines
- Commit style: Conventional Commits (e.g., `feat: ...`, `fix: ...`, `style: ...`).
- PRs: clear description, linked issues, test plan; include screenshots/GIFs for UI changes.
- Checks: lint and tests must pass; include schema/migration updates when applicable.

## Security & Configuration Tips
- Never commit secrets. Copy `.env.example` → `.env` and fill values (OAuth, DB, admin email).
- After schema changes: run migrations and regenerate Prisma client.
