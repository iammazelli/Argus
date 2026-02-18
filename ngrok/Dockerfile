FROM alpine:latest

RUN apk add --no-cache wget unzip

RUN wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.zip -O ngrok.zip && \
    unzip ngrok.zip && \
    rm ngrok.zip && \
    mv ngrok /usr/local/bin/

# Copia os dois arquivos de configuração
COPY ngrok.yml /etc/ngrok.yml
COPY start-ngrok.sh /usr/local/bin/

# Torna o script executável
RUN chmod +x /usr/local/bin/start-ngrok.sh

# Define o script como o comando de entrada do contêiner
ENTRYPOINT ["start-ngrok.sh"]