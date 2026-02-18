const mqtt = require('mqtt');
const { mqtt: mqttConfig } = require('../config');
const { insertSensorData} = require('./db_service');

const connect  = () => {
    /**
     * Inicia a conexão com o Broker mqtt e configura os listeners de eventos
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

    //Evento disparado quando uma mensagem chega num tópico inscrito
    client.on('message', (topic, message) => {
        try {
            const deviceIdStr = topic.split('/')[1]; // Extraindo id do dispositivo (segunda parte o tópico)
            const data = JSON.parse(message.toString()); // Mensagem chega como um buffer, então convertemos para string e depois para JSON

            console.log(`[MQTT] Mensagem recebida do dispositivo ${deviceIdStr}:`, data);

            insertSensorData(deviceIdStr, data);
        } catch (error) {
            // Parsing falha se a mensagem não for um JSON válido
            // Capturamos o erro para que a aplicação não pare de funcionar
            console.error(`[MQTT] Erro ao processar mensagem do tópico ${topic}:`, error)
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