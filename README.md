
# 👁️ Argus IoT Platform

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-24-green.svg)
![MySQL](https://img.shields.io/badge/MySQL-8.0-orange.svg)
![EMQX](https://img.shields.io/badge/EMQX-5.1.0-brightgreen.svg)

Uma plataforma de telemetria e gestão de dispositivos IoT focada em alta performance, escalabilidade e processamento de dados em tempo real. Desenhada para suportar milhares de sensores a enviar dados simultaneamente, otimizando tanto a ingestão de alto volume quanto o consumo analítico para dashboards.

## 🏗️ Arquitetura de Dados (Abordagem Híbrida/Lambda)

O Argus utiliza uma arquitetura de duas camadas para equilibrar a velocidade de gravação e a performance de leitura analítica:

1. **Ingestão em Tempo Real:** Os dispositivos publicam payloads JSON via MQTT. O backend Node.js persiste esses dados brutos na tabela `Real_Time_Data`.
2. **Processamento Batch (ETL Diário):** Um *Cron Job* agendado para as 00:05 processa os dados da `Real_Time_Data`, calculando métricas (Média, Mínimo, Máximo e Desvio Padrão) em janelas de 10 minutos e salvando-as na tabela `Historical_Data`.
3. **Query Híbrida:** A API combina dados históricos processados com dados de hoje agregados em tempo real, garantindo dashboards sempre atualizados sem perda de performance.

## 🚀 Tecnologias Utilizadas

* **Broker MQTT:** EMQX 5.1.0.
* **Backend:** Node.js (Express, node-cron, mqtt.js).
* **Base de Dados:** MySQL 8.0 com suporte a dados espaciais (`POINT`) e JSON.
* **Infraestrutura:** Docker & Docker Compose com rede compartilhada `argus-shared-net`.

---

## ⚙️ Configuração das Variáveis de Ambiente (.env)

Para que o sistema funcione corretamente, você deve criar um arquivo `.env` na raiz de cada pasta de servidor.

### 1. Servidor A (Lógica e Ingestão)

Crie o arquivo em `Argus/server_a_logic/.env`:

```env
# Fuso Horário
TZ=America/Sao_Paulo

# Conexão com o Banco de Dados (Servidor B)
DB_HOST=mysql
DB_PORT=3306
DB_USER=argus
DB_PASSWORD=
DB_NAME=

# Conexão com o Broker MQTT (Local no Servidor A)
MQTT_BROKER=mqtt://emqx:1883
MQTT_USERNAME=
MQTT_PASSWORD=

# Segurança e Ambiente
JWT_SECRET=sua_chave_secreta_aqui
NODE_ENV=development
PORT=3000
```

### 2. Servidor B (Banco de Dados e Web)

Crie o arquivo em `Argus/server_b_logic/.env`:

```env
# Fuso Horário
TZ=America/Sao_Paulo

# Senhas do MySQL
MYSQL_ROOT_PASSWORD=
MYSQL_DATABASE=
MYSQL_USER=
MYSQL_PASSWORD=
```

---

## 📂 Passo a Passo para Execução

### 1. Criação da Rede Docker

```bash
docker network create argus-shared-net
```

### 2. Execução do Servidor B (Dados)

```bash
cd Argus/server_b_logic
docker-compose up -d --build
```

### 3. Execução do Servidor A (Backend/MQTT)

```bash
cd ../server_a_logic
docker-compose up -d --build
```

---

## 🔌 Conectar um Novo Dispositivo

1. Acesse `http://localhost` e registre um novo dispositivo usando o mapa interativo.
2. Obtenha o **Hash do Dispositivo** gerado.
3. Configure seu hardware para publicar no tópico:
   `argus/<SEU_DEVICE_HASH>/telemetry`

**Exemplo de Payload:**

```json
{
  "temperatura": 25.4,
  "umidade": 62.1
}
```

---

*Desenvolvido para alta performance e escalabilidade em ambientes de IoT.*
