# syntax=docker/dockerfile:1.7

# Node 24 matches local development. All runtime deps are pure JS (bcryptjs,
# pg, nodemailer, ejs), so alpine needs no C toolchain.
ARG NODE_VERSION=24-alpine

# ---- builder: full deps + compile TS -> dist -------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# --ignore-scripts: the "prepare" lifecycle runs husky, which needs a .git dir
# (absent here) and is dev-only tooling irrelevant to the image.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# nest build compiles src -> dist/main.js (tsconfig.build.json excludes
# scripts/ and test/, so src is the root) and copies **/templates/*.ejs into
# dist so EmailService finds them next to the compiled code.
COPY . .
RUN npm run build

# ---- prod-deps: runtime node_modules only ----------------------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- migrator: one-shot schema migrations (Cloud Run Job, see cloudbuild.yaml)
# Built with --target migrator. Reuses the builder stage because sequelize-cli
# and dotenv (required by database/config.js) are devDependencies, and the
# runner image ships neither database/ nor .sequelizerc. Runs migrations only;
# seeders are never run from the pipeline.
FROM builder AS migrator
ENV NODE_ENV=production
USER node
CMD ["node", "node_modules/sequelize-cli/lib/sequelize", "db:migrate"]

# ---- runner: lean runtime image --------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

# Cloud Run overrides PORT (8080); 3000 is only the fallback for docker run.
ENV NODE_ENV=production \
    PORT=3000

# node:alpine ships a non-root "node" user.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder   --chown=node:node /app/dist         ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

# The app only listens after Sequelize connects, so this doubles as a
# readiness gate. "/" is version-neutral and unprefixed (see main.ts).
# Cloud Run ignores HEALTHCHECK; it is for local docker / compose.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# One process per container: Cloud Run scales by instances, not PM2 clusters.
CMD ["node", "dist/main.js"]
