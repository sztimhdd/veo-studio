# ── Stage 1: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

# Add base build tools for any transitive native deps
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time env: injected by GitHub Actions via --build-arg
# Write a .env file so Vite's native dotenv loading picks it up directly.
# This is the most reliable method — no define block hacks needed.
ARG GEMINI_API_KEY
RUN echo "VITE_GEMINI_API_KEY=${GEMINI_API_KEY}" > .env && \
    echo "GEMINI_API_KEY=${GEMINI_API_KEY}" >> .env && \
    echo "--- Build env check ---" && \
    test -n "${GEMINI_API_KEY}" && echo "API_KEY: SET (length=$(echo -n ${GEMINI_API_KEY} | wc -c))" || echo "API_KEY: MISSING!"

RUN npm run build

# ── Stage 2: Serve ──
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
