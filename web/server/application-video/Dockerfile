# Servicio de videos de postulación de AceCam (PCIT-251). Se construye en el pipeline con el
# contexto web/:  docker build -f server/application-video/Dockerfile .
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
LABEL org.opencontainers.image.source="https://github.com/mort1zr/AceCam"
# ffprobe valida formato, resolución y FPS antes de guardar el video.
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production ACECAM_FFPROBE=/usr/bin/ffprobe
COPY server/application-video/package.json server/application-video/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# Solo lo que usa el servicio, con las mismas rutas relativas que en el repositorio.
COPY src/panel/lib/schema.js src/panel/lib/videoRequirements.js ./src/panel/lib/
COPY server/video-import/applicationVideo.js server/video-import/probe.js server/video-import/errors.js ./server/video-import/
COPY server/application-video/app.js server/application-video/server.js ./server/application-video/
USER node
EXPOSE 8080
CMD ["node", "server/application-video/server.js"]
