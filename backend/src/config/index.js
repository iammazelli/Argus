require('dotenv').config();

// Para o código gerado no wizard: host/porta do broker (dispositivos fora do Docker usam isso)
function getMqttCodeConfig() {
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    const publicHost = process.env.MQTT_PUBLIC_HOST;
    const publicPort = process.env.MQTT_PUBLIC_PORT;
    let host = publicHost;
    let port = publicPort != null ? parseInt(publicPort, 10) : null;
    if (!host || !port) {
        try {
            const u = new URL(brokerUrl);
            host = host || u.hostname;
            port = port != null ? port : (u.port ? parseInt(u.port, 10) : 1883);
        } catch (_) {
            host = host || 'localhost';
            port = port != null ? port : 1883;
        }
    }
    return { brokerUrl, host: String(host), port };
}

module.exports = {
    mqtt: {
        brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
        topic: 'devices/+/data',
        topicAll: 'devices/#',  // aceita também devices/<id> sem /data
        getMqttCodeConfig
    }
};