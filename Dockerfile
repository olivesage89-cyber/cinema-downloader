FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 ffmpeg ca-certificates curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
EXPOSE 3000
# Fetch the newest yt-dlp on every container start so TikTok/Instagram extractors stay
# current (TikTok breaks old versions constantly). Falls back to the baked-in binary if
# the download fails (e.g. offline), then starts the server.
CMD ["sh", "-c", "curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp || true; yt-dlp --version || true; node server.js"]
