FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY backend ./backend

EXPOSE 5001

CMD ["npm", "run", "server"]
