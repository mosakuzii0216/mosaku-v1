# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Mosaku is a full-stack memo/notebook application with multi-tenant support, OAuth authentication, and a theming system:

- **Frontend**: React 19 + TypeScript + Vite with Tailwind CSS
- **Backend**: NestJS + TypeScript with Prisma ORM
- **Database**: Supabase PostgreSQL (managed cloud database)
- **Infrastructure**: Docker Compose (development), Vercel + Cloud Run + Supabase (production)

### Key Features
- Multi-user memo and notebook management with tagging
- JWT + OAuth authentication (Google, GitHub, X/Twitter)
- Invitation code system for user registration
- Custom theme system with CSS file-based themes
- Role-based access control (FREE, PREMIUM, ADMIN)
- Rich text editor (TipTap)

## Development Commands

### Monorepo Commands (from root)
```bash
# Install all dependencies
npm install

# Run both frontend and backend in development
npm run dev

# Build both projects
npm run build

# Lint all code
npm run lint

# Format all code
npm run format
```

### Docker Environment
```bash
# Start all services (backend:3000, frontend:5173, nginx:80)
# Note: Database is now hosted on Supabase (cloud)
docker-compose up

# Stop all services
docker-compose down

# Rebuild and restart
docker-compose up --build
```

### Backend Development (NestJS)
```bash
cd backend

# Development
npm run start:dev          # Watch mode with hot reload
npm run start:debug        # Debug mode with watch

# Build and Production
npm run build              # Compile TypeScript
npm run start:prod         # Run production build

# Testing
npm run test               # Run unit tests
npm run test:watch         # Watch mode for tests
npm run test:e2e           # End-to-end tests
npm run test:cov           # Generate coverage report

# Code Quality
npm run lint               # ESLint (auto-fix enabled)
npm run lint:fix           # Explicit fix command
npm run format             # Prettier format
npm run format:check       # Check formatting without changes

# Database
npx prisma migrate dev     # Create and apply migration
npx prisma migrate deploy  # Apply migrations (production)
npx prisma generate        # Generate Prisma client
npx prisma studio          # Open Prisma Studio GUI
npm run migration:apply    # Alias for migrate dev
npm run migration:deploy   # Alias for migrate deploy
```

### Frontend Development (React + Vite)
```bash
cd frontend

# Development
npm run dev                # Start dev server on port 5173
npm run preview            # Preview production build

# Build
npm run build              # TypeScript check + Vite build

# Code Quality
npm run lint               # ESLint
npm run lint:fix           # ESLint with auto-fix
npm run format             # Prettier format
npm run format:check       # Check formatting
```

## High-Level Architecture

### Backend Module Structure

The backend follows NestJS modular architecture with clear separation:

```
AppModule
├── ConfigModule (Global) - Centralized environment configuration
├── PrismaModule (Global) - Database access layer
├── CommonModule - Shared services (AuthorizationService for ownership checks)
├── AuthModule - Authentication & authorization (JWT + OAuth strategies)
├── InvitationModule - Invitation code management
├── MemoModule - Memo CRUD operations
├── NotebookModule - Notebook management
├── TagModule - Tag system with many-to-many relations
└── ThemeModule - Theme management with CSS file support
```

**Key Patterns:**
- All protected routes use `@UseGuards(JwtAuthGuard)`
- Public endpoints marked with `@Public()` decorator
- User ownership validation via `AuthorizationService.checkOwnership()`
- DTOs use `class-validator` and `class-transformer`
- All modules export services for cross-module dependencies

### Frontend State Management

**Zustand Stores** (Client State):
- `useMemoStore`: Memo data, selected memo, view state (list/edit/create), mobile/desktop mode
- `useTagStore`: Tag data and management

**React Context**:
- `AuthContext`: User authentication state, login/logout/OAuth flows

**React Query** (Server State):
- All API calls use React Query for caching and synchronization
- Custom hooks like `useMemoQueries` wrap API endpoints

**View State Flow**:
The app uses an `ObjectType` ('memo' | 'notebook' | 'tag') and `ViewType` ('list' | 'edit' | 'create') state machine managed by `useMemoStore` to control what's displayed.

### Authentication Flow

**Backend:**
1. Passport strategies (Google, GitHub, X) handle OAuth flow
2. Successful auth returns JWT token with user payload
3. `JwtAuthGuard` validates token on protected routes
4. `JwtStrategy` extracts user from token and attaches to request

**Frontend:**
1. `AuthContext` manages authentication state
2. JWT stored in localStorage via `AuthTokenManager`
3. All API requests include `Authorization: Bearer <token>` header
4. OAuth flows redirect to backend `/auth/{provider}` and return to frontend with token

**Invitation Code System:**
- New users require invitation code (except admin email)
- Codes have max uses and expiration
- Validated before user creation
- Admin role can create codes via `/admin/invitations`

### Database Schema Highlights

**User Model:**
- CUID primary key
- Supports both OAuth (`oauthId`) and email/password (`password`)
- Role-based access: `FREE`, `PREMIUM`, `ADMIN`
- Admin determined by `ADMIN_EMAIL` environment variable

**Memo ↔ Notebook ↔ Tag Relationships:**
- Memos belong to one Notebook (optional, nullable)
- Memos can have many Tags via `MemoTag` join table
- Notebooks can have many Tags via `NotebookTag` join table
- All entities scoped to User (cascade delete)

**Theme System:**
- `cssFilePath` points to CSS file in `frontend/public/themes/`
- Themes can be system (`isSystem: true`) or user-created
- Categories organize themes
- Users can favorite themes

### Prisma Client Location

The Prisma client is generated to `backend/generated/prisma/` (not default `node_modules`). This is configured in `schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}
```

Always run `npx prisma generate` after schema changes.

## Deployment Architecture

The application supports two deployment modes:

**Local Development:**
- Docker Compose orchestrates all services
- Nginx reverse proxy routes traffic
- PostgreSQL in container

**Production (Current Setup):**
- **Frontend**: Vercel (static site)
- **Backend**: Google Cloud Run (containerized NestJS)
- **Database**: Supabase PostgreSQL

See [docs/deployment/](./docs/deployment/) for production deployment instructions.

### Environment Variables

**Critical Backend Variables:**
- `DATABASE_URL` - PostgreSQL connection (with connection pooling for Supabase)
- `DIRECT_URL` - Direct PostgreSQL connection (for migrations)
- `JWT_SECRET` - JWT signing key
- `CORS_ORIGINS` - Comma-separated allowed origins
- OAuth credentials: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc.

**Critical Frontend Variables (VITE_ prefix required):**
- `VITE_BACKEND_URL` - Backend API URL
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key
- OAuth client IDs for frontend: `VITE_GOOGLE_CLIENT_ID`, etc.

## Important Implementation Notes

### Adding New Protected Endpoints

```typescript
@Controller('resource')
@UseGuards(JwtAuthGuard)  // Apply to all routes
export class ResourceController {
  @Get()
  findAll(@Request() req: AuthenticatedRequest) {
    const userId = req.user.id;  // User from JWT
    // ... implementation
  }

  @Public()  // Override guard for specific route
  @Get('public')
  publicEndpoint() {
    // No authentication required
  }
}
```

### Ownership Validation Pattern

```typescript
// In service
constructor(
  private prisma: PrismaService,
  private authService: AuthorizationService,
) {}

async update(id: string, userId: string, data: UpdateDto) {
  const resource = await this.prisma.resource.findUnique({ where: { id } });
  // Throws ForbiddenException if user doesn't own resource
  this.authService.checkOwnership(resource, userId);
  // ... update logic
}
```

### Frontend API Calls Pattern

```typescript
// Use centralized API_BASE_URL from utils/api.ts
const response = await fetch(`${API_BASE_URL}/endpoint`, {
  headers: {
    'Authorization': `Bearer ${AuthTokenManager.getAccessToken()}`,
    'Content-Type': 'application/json',
  },
});
```

### Theme System

Themes are CSS files in `frontend/public/themes/{category}/{theme-name}.css`. The theme service:
1. Stores theme metadata in database (name, category, cssFilePath)
2. Frontend loads CSS file dynamically when theme is selected
3. CSS variables define colors, typography, layout, etc.

### Testing Strategy

- **Backend**: Jest for unit tests, Supertest for E2E
- **Frontend**: No test framework configured yet
- Use `npm run test:watch` for TDD workflow
- Coverage reports generated to `backend/coverage/`

## Common Gotchas

1. **Prisma Client Not Found**: Run `npx prisma generate` after pulling schema changes
2. **CORS Errors**: Ensure `CORS_ORIGINS` includes your frontend URL
3. **OAuth Redirect Mismatch**: OAuth provider callback URLs must match `{BACKEND_URL}/auth/{provider}/callback`
4. **Migration Conflicts**: Always pull latest migrations before creating new ones
5. **Docker Port Conflicts**: Ensure ports 80, 3000, 5173 are available
6. **Environment Variables**: Frontend variables MUST have `VITE_` prefix to be exposed
7. **Supabase Connection**: Ensure `DATABASE_URL` uses pooling connection (port 6543) and `DIRECT_URL` uses direct connection (port 5432) for migrations

## Spec Driven Development (SDD)

本プロジェクトでは仕様駆動開発を採用しています。新機能の開発時は、実装前にステアリングファイル（仕様書）を作成します。

### ワークフロー

```
/add-feature {機能名}
```

このコマンドで以下が自動実行されます:
1. プロジェクト理解・既存パターン調査
2. ステアリングファイル生成（requirements → design → tasklist）
3. タスクリストに基づく実装
4. コードレビュー・品質検証
5. 振り返り記録

### ディレクトリ構成

```
.claude/
├── commands/add-feature.md       # 新機能開発コマンド
├── skills/steering/              # ステアリング管理スキル
│   ├── SKILL.md
│   └── templates/                # 仕様書テンプレート
└── agents/code-reviewer.md       # コードレビューエージェント

.steering/                        # 生成された仕様書（Git管理対象）
├── {YYYYMMDD}-{機能名}/          # 機能開発ディレクトリ
│   ├── brainstorm.md             # /brainstorm 経由の場合のみ
│   ├── requirements.md           # 要件定義
│   ├── design.md                 # 設計
│   └── tasklist.md               # タスクリスト + 振り返り
└── {YYYYMMDD}-explore/           # 機能未決のブレスト
    └── brainstorm.md
```

**命名規則**: 全エントリ `{YYYYMMDD}-{kebab-case-name}/` ディレクトリに統一

### 重要なルール

- 新機能開発時は必ず `/add-feature` を使用する
- 実装中は常に `tasklist.md` を参照し、完了タスクを `[x]` に更新する
- ステアリングファイルはGit管理対象。仕様変更があれば反映する

## Documentation

For detailed technical documentation, see the [docs/](./docs) directory:

- **[Migration Plans](./docs/migration/overview.md)** - Cloud migration roadmap and detailed plans
- **[Deployment Guides](./docs/deployment/)** - Cloud Run and Vercel deployment instructions
- **[Development Docs](./docs/development/)** - Development-related documentation

All documentation is organized in [docs/README.md](./docs/README.md).
