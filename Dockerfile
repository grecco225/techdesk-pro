FROM node:20-alpine

RUN apk add --no-cache build-base python3 py3-setuptools

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Crear directorio de datos (será un volumen persistente en Render)
RUN mkdir -p /app/data

EXPOSE 8005

CMD ["node", "server.js"]
