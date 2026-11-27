FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.html style.css ai-policy.js game.js online.js version-check.js server.js ./
EXPOSE 10000

CMD ["npm", "start"]
