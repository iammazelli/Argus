const express = require('express');
const dbService = require('./services/db_service');
const mqttHandler = require('./services/mqtt_handler');

async function startApp() {
    console.log('Iniciando a aplicação...');
    
    try {
        // Inicializa o banco de dados e a conexão MQTT
        await dbService.initializeDatabase();
        mqttHandler.connect(); 

        const app = express();
        const port = 3000;

        app.use(express.json());

        // Endpoint para listar todos os dispositivos (usado na index.html)
        app.get('/api/devices', async (req, res) => {
            try {
                const devices = await dbService.getAllDevices();
                res.json(devices);
            } catch (error) {
                console.error('[API] Falha ao buscar dispositivos:', error);
                res.status(500).json({ message: 'Erro interno do servidor' });
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