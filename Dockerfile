# Build stage - cache bust v2
FROM node:20-alpine AS builder

# Force cache invalidation
ARG CACHE_BUST=1

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy server file
COPY server.js ./

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
