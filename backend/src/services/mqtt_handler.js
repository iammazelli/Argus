const mqtt = require('mqtt');
const { mqtt: mqttConfig } = require('../config');
const deviceStore = require('./device_store');

let mqttClient = null;

function isConnected() {
    return mqttClient != null && mqttClient.connected;
}

const connect = () => {
    const brokerUrl = mqttConfig.brokerUrl;
    if (!brokerUrl) {
        console.error('[MQTT] MQTT_BROKER_URL não definida. Defina no .env ou no docker-compose.');
        return;
    }
    console.log('[MQTT] Conectando ao broker:', brokerUrl);
    mqttClient = mqtt.connect(brokerUrl, { reconnectPeriod: 3000 });

    mqttClient.on('connect', () => {
        console.log('[MQTT] Conectado ao broker:', brokerUrl);
        const topicToSub = mqttConfig.topicAll || mqttConfig.topic;
        mqttClient.subscribe(topicToSub, (err) => {
            if (!err) {
                console.log(`[MQTT] Inscrito em "${topicToSub}" — aguardando mensagens em devices/<id>/data ou devices/<id>`);
            } else {
                console.error('[MQTT] Falha ao inscrever no tópico:', err);
            }
        });
    });

    mqttClient.on('message', (topic, message) => {
        const parts = topic.split('/');
        const deviceIdStr = parts[1];
        if (!deviceIdStr) {
            console.warn('[MQTT] Tópico ignorado (sem device_id):', topic);
            return;
        }
        let raw;
        try {
            raw = JSON.parse(message.toString());
        } catch (error) {
            console.error(`[MQTT] Payload não é JSON válido no tópico ${topic}. Início:`, String(message).slice(0, 200));
            return;
        }
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            console.warn('[MQTT] Payload ignorado (deve ser objeto JSON):', topic);
            return;
        }
        try {
            deviceStore.upsertDevice(deviceIdStr, raw);
            const { broker_key, ...data } = raw;
            console.log(`[MQTT] Dispositivo "${deviceIdStr}" atualizado. Dados:`, data);
        } catch (error) {
            console.error(`[MQTT] Erro ao processar mensagem do dispositivo ${deviceIdStr}:`, error);
        }
    });

    mqttClient.on('error', (error) => {
        console.error('[MQTT] Erro de conexão:', error);
    });

    mqttClient.on('reconnect', () => {
        console.log('[MQTT] Reconectando ao broker...');
    });

    mqttClient.on('offline', () => {
        console.warn('[MQTT] Cliente offline.');
    });
};

module.exports = {
    connect,
    isConnected,
    getClient: () => mqttClient
};
