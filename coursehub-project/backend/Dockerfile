FROM node:22-bookworm

# O Chrome do Puppeteer não traz essas libs. Sem elas o worker abre o
# browser e o processo morre com "Target closed".
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

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