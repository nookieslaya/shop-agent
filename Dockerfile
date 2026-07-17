FROM node:22-alpine

WORKDIR /app

RUN npm install --global npm@11.9.0

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npm", "run", "check"]
