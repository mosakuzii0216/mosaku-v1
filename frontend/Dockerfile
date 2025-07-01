# frontend/Dockerfile

# Base Stage: Node.js 22 LTS を指定
FROM node:22-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Development Stage
FROM base AS development
CMD ["npm", "run", "dev"]

# Production Stage
FROM base AS production
COPY . .
RUN npm run build
RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "80"]