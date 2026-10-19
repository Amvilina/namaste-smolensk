FROM node:22-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY src/menu.json ./menu.json
ENV PORT=8080
ENV DATA_DIR=/data
ENV MENU_PATH=/app/menu.json
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/server.ts"]
