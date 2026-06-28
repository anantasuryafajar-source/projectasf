# =====================================================================
# NestJS backend — production image (multi-stage).
# Build context must be the BACKEND directory (backend/).
#   docker build -t ananta-backend ./backend
# =====================================================================

# ---- build stage ----
# Node 22+ provides a global WebSocket, required by @supabase/supabase-js's
# realtime client at construction time (Node 20 would crash on boot).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Render/Railway inject PORT; the app reads it via ConfigService.
EXPOSE 3000
CMD ["node", "dist/main.js"]
