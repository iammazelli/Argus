const express = require('express');
const deviceStore = require('./services/device_store');
const mqttHandler = require('./services/mqtt_handler');
const { mqtt: mqttConfig } = require('./config');

function startApp() {
    console.log('Iniciando a aplicação (modo tempo real, sem banco de dados)...');

    mqttHandler.connect();

    const app = express();
    const port = 3000;

    app.use(express.json());

    app.get('/api/config/mqtt', (req, res) => {
        try {
            const { brokerUrl, host, port } = mqttConfig.getMqttCodeConfig();
            res.json({ brokerUrl: brokerUrl || `mqtt://${host}:${port}`, host, port });
        } catch (error) {
            console.error('[API] Erro ao obter config MQTT:', error);
            res.status(500).json({ message: 'Erro ao obter configuração do broker' });
        }
    });

    app.get('/api/devices', (req, res) => {
        try {
            const all = deviceStore.getAllDevices();
            const withOnline = all.map(d => ({
                ...d,
                online: deviceStore.isDeviceOnline(d)
            }));
            if (all.length > 0) {
                console.log('[API] GET /api/devices ->', all.length, 'dispositivo(s)');
            }
            res.json(withOnline);
        } catch (error) {
            console.error('[API] Falha ao buscar dispositivos:', error);
            res.status(500).json({ message: 'Erro interno do servidor' });
        }
    });

    app.get('/api/devices/:id', (req, res) => {
        try {
            const { id } = req.params;
            const device = deviceStore.getDeviceById(id);
            if (device) {
                res.json(device);
            } else {
                res.status(404).json({ message: 'Dispositivo não encontrado' });
            }
        } catch (error) {
            console.error('[API] Falha ao buscar dispositivo:', error);
            res.status(500).json({ message: 'Erro interno do servidor' });
        }
    });

    app.get('/api/debug/devices', (req, res) => {
        try {
            const all = deviceStore.getAllDevices();
            res.json({ total: all.length, devices: all });
        } catch (error) {
            console.error('[API] Falha no debug:', error);
            res.status(500).json({ message: 'Erro interno do servidor' });
        }
    });

    app.get('/api/debug/mqtt', (req, res) => {
        try {
            const connected = mqttHandler.isConnected();
            res.json({
                mqttConnected: connected,
                brokerUrl: mqttConfig.brokerUrl,
                hint: connected ? 'Backend está conectado ao broker. Publique em devices/<id>/data com JSON.' : 'Backend NÃO está conectado ao broker. Verifique MQTT_BROKER_URL e se o EMQX está no ar.'
            });
        } catch (error) {
            res.status(500).json({ mqttConnected: false, error: String(error.message) });
        }
    });

    app.listen(port, () => {
        console.log(`[API] Servidor rodando na porta ${port}`);
    });
}

startApp();
