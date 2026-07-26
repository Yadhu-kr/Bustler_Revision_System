FROM node:20-alpine

WORKDIR /app

# Copy backend package files
COPY backend/package.json backend/package-lock.json* ./backend/

# Install dependencies
WORKDIR /app/backend
RUN npm install --production

# Copy the entire project (backend + frontend static files)
WORKDIR /app
COPY . .

# Set working directory to backend for startup
WORKDIR /app/backend

# Cloud Run injects PORT env var
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
