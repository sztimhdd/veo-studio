# ── Stage 1: Build ──
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies for native modules (specifically for node-canvas used by imagehash-web)
RUN apk add --no-cache python3 make g++ pkgconfig cairo-dev jpeg-dev pango-dev giflib-dev librsvg-dev

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time env: injected by Cloud Build / GitHub Actions
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

RUN npm run build

# ── Stage 2: Serve ──
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
