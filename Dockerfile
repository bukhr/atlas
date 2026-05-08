# syntax=docker/dockerfile:1.7
# ============================================================
# Stage 1 — build SvelteKit static site + bundle Node server
# ============================================================
FROM node:22-alpine AS builder
WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time env vars consumed by Vite (VITE_*, PUBLIC_*) must be present here.
# Override them at build time: docker build --build-arg VITE_GOOGLE_CLIENT_ID=...
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_ROOT_FOLDER_ID
ARG VITE_GA_MEASUREMENT_ID
ARG PUBLIC_APP_URL
ARG PUBLIC_APP_NAME
ARG PUBLIC_CONTACT_EMAIL
ARG PUBLIC_PRIVACY_POLICY_URL

ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV VITE_ROOT_FOLDER_ID=${VITE_ROOT_FOLDER_ID}
ENV VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}
ENV PUBLIC_APP_URL=${PUBLIC_APP_URL}
ENV PUBLIC_APP_NAME=${PUBLIC_APP_NAME}
ENV PUBLIC_CONTACT_EMAIL=${PUBLIC_CONTACT_EMAIL}
ENV PUBLIC_PRIVACY_POLICY_URL=${PUBLIC_PRIVACY_POLICY_URL}

RUN npm run build

# ============================================================
# Stage 2 — runtime
# ============================================================
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_DIR=/app/build
ENV STORAGE_PATH=/app/data

RUN addgroup -S atlas && adduser -S atlas -G atlas

COPY --from=builder --chown=atlas:atlas /app/build ./build
COPY --from=builder --chown=atlas:atlas /app/dist ./dist

RUN mkdir -p /app/data && chown atlas:atlas /app/data

USER atlas

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

CMD ["node", "dist/server.js"]
