FROM node:24-alpine

WORKDIR /app

# Instala nodemon globalmente para hot-reload
RUN npm install -g nodemon

# Copia manifesto e instala dependências
COPY package*.json ./
RUN npm install

# Copia código-fonte (sobrescrito pelo volume em dev)
COPY src/ ./src/

EXPOSE 3000

# Hot-reload via nodemon: qualquer alteração em /app/src reinicia o processo
CMD ["nodemon", "--watch", "src", "--ext", "js,json", "src/server.js"]