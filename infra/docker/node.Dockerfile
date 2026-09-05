# en-GB: Produces separate non-root Linux images for the legacy API and existing Next.js Web during migration.
FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS dependencies
RUN apk add --no-cache --upgrade libcrypto3=3.5.8-r0 libssl3=3.5.8-r0
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS generated
ENV DATABASE_URL=postgresql://shiftflow:container-build@127.0.0.1:1/shiftflow_build?schema=public
COPY prisma ./prisma
COPY .config/prisma.ts ./.config/prisma.ts
COPY tsconfig.json ./
RUN npm run prisma:generate

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM generated AS api-build
COPY apps/api ./apps/api
RUN npm run build:api

FROM generated AS web-build
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ARG NEXT_PUBLIC_ALLOW_INSECURE_LOOPBACK=false
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_ALLOW_INSECURE_LOOPBACK=$NEXT_PUBLIC_ALLOW_INSECURE_LOOPBACK
RUN npm run build:web

FROM generated AS migration
RUN test "$(readlink -f /usr/local/bin/npm)" = /usr/local/lib/node_modules/npm/bin/npm-cli.js \
    && test "$(readlink -f /usr/local/bin/npx)" = /usr/local/lib/node_modules/npm/bin/npx-cli.js \
    && test "$(node -p 'require("/usr/local/lib/node_modules/npm/package.json").name')" = npm \
    && rm -r /usr/local/lib/node_modules/npm \
    && rm /usr/local/bin/npm /usr/local/bin/npx
USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS legacy-api
RUN apk add --no-cache --upgrade libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 \
    && test "$(readlink -f /usr/local/bin/npm)" = /usr/local/lib/node_modules/npm/bin/npm-cli.js \
    && test "$(readlink -f /usr/local/bin/npx)" = /usr/local/lib/node_modules/npm/bin/npx-cli.js \
    && test "$(node -p 'require("/usr/local/lib/node_modules/npm/package.json").name')" = npm \
    && rm -r /usr/local/lib/node_modules/npm \
    && rm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /workspace/package.json ./
COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=generated --chown=node:node /workspace/generated ./generated
COPY --from=api-build --chown=node:node /workspace/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/api/server.js"]

FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS web
RUN apk add --no-cache --upgrade libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 \
    && test "$(readlink -f /usr/local/bin/npm)" = /usr/local/lib/node_modules/npm/bin/npm-cli.js \
    && test "$(readlink -f /usr/local/bin/npx)" = /usr/local/lib/node_modules/npm/bin/npx-cli.js \
    && test "$(node -p 'require("/usr/local/lib/node_modules/npm/package.json").name')" = npm \
    && rm -r /usr/local/lib/node_modules/npm \
    && rm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /workspace/package.json ./
COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=web-build --chown=node:node /workspace/apps/web ./apps/web
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "apps/web", "-p", "3000"]
