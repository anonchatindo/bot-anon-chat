FROM node:20
WORKDIR /app
COPY package.json index.js ./
RUN npm install
CMD ["node", "index.js"]
