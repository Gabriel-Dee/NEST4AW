# Production image for the staff web app. deploy/deploy.sh writes .env.production
# (NEXT_PUBLIC_API_URL) before building, because Next.js bakes NEXT_PUBLIC_* in at build time.
FROM node:22-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
