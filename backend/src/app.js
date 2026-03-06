const express = require('express');
const dbService = require('./services/db_service');
const mqttHandler = require('./services/mqtt_handler');
const { mqtt: mqttConfig } = require('./config');

async function startApp() {
    console.log('Iniciando a aplicação...');
    
    try {
        // Inicializa o banco de dados e a conexão MQTT
        await dbService.initializeDatabase();
        mqttHandler.connect(); 

        const app = express();
        const port = 3000;

        app.use(express.json());

        // Configuração MQTT para o wizard (código gerado com endereço do broker)
        app.get('/api/config/mqtt', (req, res) => {
            try {
                const { brokerUrl, host, port } = mqttConfig.getMqttCodeConfig();
                res.json({ brokerUrl: brokerUrl || `mqtt://${host}:${port}`, host, port });
            } catch (error) {
                console.error('[API] Erro ao obter config MQTT:', error);
                res.status(500).json({ message: 'Erro ao obter configuração do broker' });
            }
        });

        // Endpoint para listar dispositivos (usado na index.html). ?online=true = só os que enviaram dados nos últimos 5 min
        app.get('/api/devices', async (req, res) => {
            try {
                const onlineOnly = req.query.online === 'true';
                const devices = await dbService.getAllDevices(onlineOnly);
                res.json(devices);
            } catch (error) {
                console.error('[API] Falha ao buscar dispositivos:', error);
                res.status(500).json({ message: 'Erro interno do servidor' });
            }
        });

        // Gera device_id e token de registro para o código do wizard (ID único, sem conflito com nomes ou outros dispositivos)
        app.post('/api/devices/prepare', async (req, res) => {
            try {
                const { name, description, location, lat, lng } = req.body || {};
                const deviceIdStr = await dbService.generateUniqueDeviceId();
                const token = await dbService.createRegistrationToken(deviceIdStr, {
                    name: name || deviceIdStr,
                    description: description || '',
                    location: location || null,
                    lat: lat != null ? parseFloat(lat) : null,
                    lng: lng != null ? parseFloat(lng) : null
                });
                res.json({ device_id_str: deviceIdStr, token });
            } catch (error) {
                console.error('[API] Falha ao preparar dispositivo:', error);
                res.status(500).json({ message: 'Erro ao gerar identificador do dispositivo' });
            }
        });

        // Endpoint para buscar um dispositivo específico (usado no cabeçalho da device_page.html)
        app.get('/api/devices/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const device = await dbService.getDeviceById(id);
            
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

        // Endpoint para buscar os limites de data (Primeiro e Último registro do dispositivo)
        app.get('/api/history/:id/limits', async (req, res) => {
            try {
                const { id } = req.params;
                const limits = await dbService.getDeviceLimits(id);
                res.json(limits);
            } catch (error) {
                console.error('[API] Falha ao buscar limites:', error);
                res.status(500).json({ message: 'Erro ao buscar limites de data' });
            }
        });

        // Endpoint principal de histórico com agregação (AVG, MAX, MIN) e filtro de data
        app.get('/api/history/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const { type, variable, start, end } = req.query;
                
                // Validação básica de parâmetros obrigatórios
                if (!type || !variable || !start || !end) {
                    return res.status(400).json({ message: 'Parâmetros insuficientes para a consulta.' });
                }

                const history = await dbService.getHistoricalData(id, type, variable, start, end);
                res.json(history);
            } catch (error) {
                console.error('[API] Falha ao buscar histórico:', error);
                res.status(500).json({ message: 'Erro ao buscar histórico no banco de dados' });
            }
        });

        app.listen(port, () => {
            console.log(`[API] Servidor rodando na porta ${port}`);
        });

    } catch (error) {
        console.error('Falha crítica ao iniciar a aplicação:', error);
        process.exit(1);
    }
}

startApp();