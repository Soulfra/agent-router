# Dockerfile for CALOS Agent Router
#
# Build: docker build -t calos-agent-router .
# Run: docker run -p 5001:5001 --env-file .env calos-agent-router

FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for brand presentation generation
# ImageMagick: PDF/GIF export
# FFmpeg: MP4 video export
RUN apk add --no-cache \
    imagemagick \
    ffmpeg

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Set production environment
ENV NODE_ENV=production
ENV PORT=5001

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "start"]
