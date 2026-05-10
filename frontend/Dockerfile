FROM node:20-alpine

WORKDIR /app

# Build this file from the repository root:
# docker build -f frontend/Dockerfile .
COPY package*.json ./
COPY frontend/package*.json ./frontend/

WORKDIR /app/frontend
RUN npm ci

COPY frontend ./

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
