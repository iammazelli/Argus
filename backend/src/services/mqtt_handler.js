const mqtt = require('mqtt');
const { mqtt: mqttConfig } = require('../config');
const { insertSensorData, getRegistrationByToken } = require('./db_service');

const connect  = () => {
    /**
     * Inicia a conexão com o Broker mqtt e configura os listeners de eventos.
     * Só aceita dados de dispositivos que possuem token de registro válido (broker_key no payload).
     */
    const client = mqtt.connect(mqttConfig.brokerUrl);

    // Evento disparado quando  a conexão é estabelecida com sucesso
    client.on('connect', () => {
        console.log('[MQTT] Conectado ao broker MQTT com sucesso!');

        // Após se conectar, se inscreve no tópico de interesse
        client.subscribe(mqttConfig.topic, (err) => {
            if (!err) {
                console.log(`[MQTT] Inscrito no tópico: "${mqttConfig.topic}"`);
            } else {
                console.error(`[MQTT] Falha ao se inscrever no tópico:`, err);
            }
        }); 
    });

    // Evento disparado quando uma mensagem chega num tópico inscrito
    client.on('message', async (topic, message) => {
        try {
            const deviceIdStr = topic.split('/')[1];
            const raw = JSON.parse(message.toString());
            const brokerKey = raw.broker_key;
            if (!brokerKey || typeof brokerKey !== 'string') {
                console.warn(`[MQTT] Mensagem rejeitada (sem broker_key válido) do dispositivo ${deviceIdStr}`);
                return;
            }
            const registration = await getRegistrationByToken(brokerKey);
            if (!registration) {
                console.warn(`[MQTT] Mensagem rejeitada (token inválido) do dispositivo ${deviceIdStr}`);
                return;
            }
            if (registration.device_id_str !== deviceIdStr) {
                console.warn(`[MQTT] Mensagem rejeitada (device_id do tópico não confere com o token) do dispositivo ${deviceIdStr}`);
                return;
            }
            const { broker_key, ...data } = raw;
            console.log(`[MQTT] Mensagem recebida do dispositivo ${deviceIdStr}:`, data);
            insertSensorData(deviceIdStr, data, {
                name: registration.name,
                description: registration.description,
                location: registration.location,
                lat: registration.lat,
                lng: registration.lng
            });
        } catch (error) {
            console.error(`[MQTT] Erro ao processar mensagem do tópico ${topic}:`, error);
        }
    });

    //Evento para lidar com erros de conexão
    client.on('error', (error) => {
        console.error('[MQTT] Erro de conexão:', error);
        client.end(); // Encerra o cliente em caso de erro grave
    });

    // Evento para logar tentativas de reconexão
    client.on('reconnect', () => {
        console.log('[MQTT] Tentando reconectar ao broker...');
    });
};

module.exports = {
    connect
};