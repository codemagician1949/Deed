# Preflight runtime. Build context = repository root (it reads deploy/testnet.json).
FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY deploy/testnet.json deploy/testnet.json
COPY verify/preflight-jobs-testnet.json verify/preflight-jobs-testnet.json
COPY runtime/package.json runtime/bun.lock runtime/
RUN cd runtime && bun install --frozen-lockfile --production
COPY runtime/preflight.config.json runtime/
COPY runtime/src runtime/src
WORKDIR /app/runtime
# The job ledger lives on a mounted volume so replay protection survives redeploys.
ENV JOBS_FILE=/data/jobs.json SEED_JOBS=/app/verify/preflight-jobs-testnet.json
EXPOSE 8787
CMD ["bun", "run", "src/server.ts"]
