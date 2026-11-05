# syntax=docker/dockerfile:1

# ---- build: install all deps, build client + bundle server ----
FROM node:24-alpine AS build
WORKDIR /app
# Override with an internal mirror if needed, e.g. --build-arg NPM_REGISTRY=https://my-proxy/npm/
ARG NPM_REGISTRY=https://registry.npmjs.org/
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --registry="$NPM_REGISTRY"
COPY . .
RUN npm run build

# ---- runtime: the bundled server needs no node_modules ----
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    STORAGE_BACKEND=azure
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
CMD ["node", "dist/server/index.js"]
