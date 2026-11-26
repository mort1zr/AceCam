# API de videos de AceCam (PCIT-224). Se construye en deploy-azure.yml.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
LABEL org.opencontainers.image.source="https://github.com/mort1zr/AceCamp"
WORKDIR /app
ENV NODE_ENV=production
ENV ACECAM_YT_DLP=/opt/yt-dlp/bin/yt-dlp ACECAM_FFPROBE=/usr/bin/ffprobe
COPY server/azure-videos/package.json server/azure-videos/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/azure-videos/requirements-youtube.txt ./
RUN apk add --no-cache ca-certificates ffmpeg python3 \
    && apk add --no-cache --virtual .youtube-build py3-pip \
    && python3 -m venv --without-pip /opt/yt-dlp \
    && python3 -m pip --python /opt/yt-dlp install --no-cache-dir --only-binary=:all: --require-hashes -r requirements-youtube.txt \
    && apk del .youtube-build \
    && "$ACECAM_YT_DLP" --version && "$ACECAM_FFPROBE" -version
COPY server/azure-videos/access.js server/azure-videos/bridge.js server/azure-videos/http.js server/azure-videos/importStore.js server/azure-videos/sas.js server/azure-videos/server.js server/azure-videos/youtubeImport.js ./server/azure-videos/
COPY server/video-import/download.js server/video-import/errors.js server/video-import/http.js server/video-import/importer.js server/video-import/probe.js server/video-import/youtube.js ./server/video-import/
COPY src/panel/lib/planes.js src/panel/lib/videoImportProtocol.js src/panel/lib/videoRequirements.js src/panel/lib/videoSources.js ./src/panel/lib/
USER node
EXPOSE 8080
CMD ["node", "server/azure-videos/server.js"]
