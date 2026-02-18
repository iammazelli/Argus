#!/bin/sh
set -e

# Autentica o token ngrok usando a variável de ambiente
ngrok config add-authtoken $NGROK_AUTHTOKEN

# Inicia o ngrok com o arquivo de configuração
# O comando 'exec' substitui o processo do shell pelo do ngrok
exec ngrok start --all --config /etc/ngrok.yml