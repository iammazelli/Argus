const mqtt = require('mqtt');
const { pool } = require('../config/database');

let client = null;

function connect() {
  // Ajustado para MQTT_URL (seu .env) e emqx (nome do container)
  const brokerUrl = process.env.MQTT_URL 
  
  console.log('[DEBUG] Tentando conectar ao MQTT em:', brokerUrl);

  client = mqtt.connect(brokerUrl, {
    clientId: `argus-backend-${Date.now()}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    connectTimeout: 15000,
    clean: true,
    reconnectPeriod: 5000,
    protocolVersion: 4 // Garante estabilidade no handshake
  });

  client.on('connect', () => {
    console.log('[MQTT] Conectado ao EMQX broker.');
    client.subscribe('argus/+/telemetry', { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Erro ao subscrever:', err);
      else console.log('[MQTT] Subscrito em argus/+/telemetry');
    });
  });

  client.on('message', async (topic, payload) => {
    await handleMessage(topic, payload);
  });

  client.on('error', (err) => {
    console.error('[MQTT] Erro:', err.message);
  });
  
  client.on('reconnect', () => console.log('[MQTT] Reconectando...'));
  client.on('offline', () => console.warn('[MQTT] Cliente offline.'));
}

async function handleMessage(topic, payload) {
  try {
    const parts = topic.split('/');
    if (parts.length !== 3 || parts[0] !== 'argus' || parts[2] !== 'telemetry') return;

    const deviceHash = parts[1];
    const dataPayload = payload.toString();
    const parsedData = JSON.parse(dataPayload);

    // 1. Busca o Device_Id (INT) a partir do Hash
    const [rows] = await pool.query(
      'SELECT Device_Id FROM Devices WHERE Device_Hash = ? AND Device_Is_Active = TRUE',
      [deviceHash]
    );

    if (rows.length === 0) {
      console.warn(`[MQTT] Rejeitado: Hash inativo/inexistente (${deviceHash})`);
      return;
    }

    const deviceId = rows[0].Device_Id;

    // 2. Persistência
    const strPayload = JSON.stringify(parsedData);
    
    await Promise.all([
      pool.query('INSERT INTO Real_Time_Data (Device_Id, Data_Payload) VALUES (?, ?)', [deviceId, strPayload]),
      pool.query('UPDATE Devices SET Device_Last_Seen = NOW() WHERE Device_Id = ?', [deviceId])
    ]);

    console.log(`[MQTT] Telemetria salva — Device ID: ${deviceId} (Hash: ${deviceHash})`);
    
    // 3. Processamento de Eventos
    await processEvents(deviceId, parsedData);

  } catch (err) {
    console.error('[MQTT] Erro ao processar mensagem:', err.message);
  }
}

async function processEvents(deviceId, payload) {
  try {
    const [events] = await pool.query(
      'SELECT Event_Id, Event_Var_Name, Event_Var_Value, Event_Trigger FROM Events WHERE Device_Id = ?',
      [deviceId]
    );

    for (const ev of events) {
      const val = payload[ev.Event_Var_Name];
      if (val === undefined) continue;

      let isTriggered = false;
      const threshold = Number(ev.Event_Var_Value);
      const current = Number(val);

      switch (ev.Event_Trigger) {
        case '>':  isTriggered = current > threshold;  break;
        case '>=': isTriggered = current >= threshold; break;
        case '<':  isTriggered = current < threshold;  break;
        case '<=': isTriggered = current <= threshold; break;
        case '==': isTriggered = current == threshold; break;
        case '!=': isTriggered = current != threshold; break;
      }

      if (isTriggered) {
         await pool.query('INSERT INTO Event_Log (Event_Id) VALUES (?)', [ev.Event_Id]);
         console.log(`[EVENTO] Gatilho acionado: Event_Id ${ev.Event_Id} no Device ${deviceId}`);
      }
    }
  } catch (err) {
    console.error('[MQTT] Erro no processamento de eventos:', err.message);
  }
}

function getClient() { return client; }

module.exports = { connect, getClient };