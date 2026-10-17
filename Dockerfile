# ---- build: compile shared, server and web ----
FROM node:22 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY shared shared
COPY server server
COPY web web
RUN npm run build

# ---- deps: production node_modules for the server only ----
FROM node:22 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=@calorie-tracker/server --include-workspace-root=false

# ---- runtime ----
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATABASE_PATH=/data/calories.db
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY shared/package.json shared/
COPY --from=build /app/shared/dist shared/dist
COPY server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY server/drizzle server/drizzle
COPY --from=build /app/web/dist web/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
