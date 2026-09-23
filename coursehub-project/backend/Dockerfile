FROM node:22-bookworm

WORKDIR /app

ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

RUN mkdir -p \
    /app/storage/uploads \
    /app/storage/generated-documents \
    /app/.cache/puppeteer \
    && chown -R node:node /app

USER node

EXPOSE 3001

CMD ["node", "server.js"]