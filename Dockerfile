FROM node:22-alpine

# better-sqlite3 needs a C++ build toolchain to install on Alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

# The SQLite database file lives here — mount a volume on this path
# so your data survives container restarts and image rebuilds.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
