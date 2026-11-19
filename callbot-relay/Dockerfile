# Build from the repo root:  docker build -f callbot-relay/Dockerfile -t callbot-relay .
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src/lib ./src/lib
COPY callbot-relay ./callbot-relay
RUN npx --yes esbuild@0.24.0 callbot-relay/server.ts --bundle --platform=node --target=node20 \
      --packages=external --tsconfig=tsconfig.json --outfile=callbot-relay/dist/server.js

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY callbot-relay/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/callbot-relay/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
