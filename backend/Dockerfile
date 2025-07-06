# backend/Dockerfile

# Base Stage: Node.js 22 LTS を指定
FROM node:22-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./
# パッケージの依存関係をインストール
RUN npm install

# Development Stage
FROM base AS development
COPY . .
RUN npx prisma generate
CMD ["npm", "run", "start:dev"]

# Production Stage
FROM base AS production
COPY . .
RUN npx prisma generate
RUN npm run build
CMD ["node", "dist/main"]