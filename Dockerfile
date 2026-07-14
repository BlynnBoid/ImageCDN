FROM oven/bun:1.2.18

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

ENV HOST=0.0.0.0 \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads

EXPOSE 3000
VOLUME ["/data/uploads"]

CMD ["bun", "run", "start:deploy"]
