FROM node:22-slim AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV TRACELET_BACKEND=http://backend:8000
RUN --mount=type=secret,id=build_ca if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci && npm run build && cp -r .next/static .next/standalone/.next/static && rm -rf node_modules .next/cache
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
