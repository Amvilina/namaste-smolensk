FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/server.ts"]
