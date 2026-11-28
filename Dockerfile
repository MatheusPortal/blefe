FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.html style.css avatars.js ai-policy.js game.js online.js ranking-client.js ranking.js supabase-ca.crt version-check.js server.js ./
EXPOSE 10000

CMD ["npm", "start"]
