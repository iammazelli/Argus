const express = require('express');
const cors    = require('cors');
const { testConnection } = require('./config/database');
const { connect: connectMQTT } = require('./mqtt/mqttService');
const deviceRoutes = require('./routes/devices');
const { startJob } = require('./jobs/aggregationJob');
const { MqttClient } = require('mqtt');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger simples
app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// ─── Rotas ──────────────────────────────────────────────────────────────────
app.use('/api/devices', deviceRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Boot ────────────────────────────────────────────────────────────────────
async function bootstrap() {
  await testConnection();   // valida conexão MySQL antes de subir
  if(MqttClient){
    connectMQTT();
  }            // conecta ao EMQX e começa a consumir tópicos
  startJob();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[API] Argus Backend rodando na porta ${PORT}`);
    console.log(`[API] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Boot] Falha crítica:', err);
  process.exit(1);
});