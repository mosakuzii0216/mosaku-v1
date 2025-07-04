# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a full-stack memo application built with a containerized architecture:

- **Frontend**: React + TypeScript + Vite with Tailwind CSS, using Zustand for state management and React Query for API calls
- **Backend**: NestJS with TypeScript, using Prisma ORM for database operations and PostgreSQL as the database
- **Database**: PostgreSQL with a simple `memos` table containing id, title, content, and timestamps
- **Infrastructure**: Docker Compose orchestrates all services with Nginx as reverse proxy

The application follows a clean separation of concerns:
- Frontend components are organized by feature (memo operations) and UI patterns (layouts, UI components)
- Backend uses NestJS modules with proper DTO validation and service layer patterns
- Database schema is managed through Prisma migrations

## Development Commands

### Docker Environment
```bash
# Start all services (recommended for development)
docker-compose up

# Backend runs on port 3000, Frontend on 5173, Nginx proxy on 80
# Database on 5432 (PostgreSQL)
```

### Backend (NestJS)
```bash
cd backend

# Development
npm run start:dev          # Watch mode development server
npm run start:debug        # Debug mode with watch

# Build and Production
npm run build              # Build for production
npm run start:prod         # Run production build

# Testing
npm run test               # Unit tests
npm run test:watch         # Watch mode testing
npm run test:e2e           # End-to-end tests
npm run test:cov           # Test coverage

# Code Quality
npm run lint               # ESLint with auto-fix
npm run format             # Prettier formatting

# Database
npx prisma migrate dev     # Run migrations in development
npx prisma generate        # Generate Prisma client
npx prisma studio          # Open Prisma Studio
```

### Frontend (React + Vite)
```bash
cd frontend

# Development
npm run dev                # Start development server (port 5173)
npm run preview            # Preview production build

# Build
npm run build              # Build for production (TypeScript check + Vite build)

# Code Quality
npm run lint               # ESLint
```

## Key Technical Details

### Database Schema
- Single `memos` table with CUID ids, title (100 chars), content (text), and timestamps
- Prisma client generated to `backend/generated/prisma/` directory

### API Endpoints
- `GET /memo` - List all memos (ordered by updatedAt desc)
- `GET /memo/:id` - Get memo by ID
- `POST /memo` - Create new memo
- `PUT /memo/:id` - Update memo
- `DELETE /memo/:id` - Delete memo
- `GET /memo/search?query=term` - Search memos by title/content

### Frontend State Management
- Zustand store (`useMemoStore`) manages memo data and UI state
- React Query (`useMemoQueries`) handles API calls and caching
- Responsive design with mobile/desktop layouts

### Environment Configuration
- Environment variables in `.env` file (not committed)
- Backend needs `DATABASE_URL` for PostgreSQL connection

## File Structure Notes

- Backend uses generated Prisma client from `generated/prisma/`
- Frontend components follow feature-based organization
- Both projects use TypeScript with strict type checking
- ESLint configured for both frontend and backend with consistent rules