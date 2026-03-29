const { pool } = require('../config/database');

async function getInternalId(deviceHash) {
  const [rows] = await pool.query(
    'SELECT Device_Id FROM Devices WHERE Device_Hash = ? AND Device_Is_Active = TRUE',
    [deviceHash]
  );
  return rows.length > 0 ? rows[0].Device_Id : null;
}

// GET /api/devices/:id/readings/latest
async function getLatestReadings(req, res) {
  try {
    const { id: deviceHash } = req.params;
    const deviceId = await getInternalId(deviceHash);
    
    if (!deviceId) return res.status(404).json({ success: false, message: 'Dispositivo não encontrado.' });

    const [rows] = await pool.query(`
      SELECT Data_Payload, Data_Time_Stamp AS RecordedAt
      FROM Real_Time_Data
      WHERE Device_Id = ?
      ORDER BY Data_Time_Stamp DESC
      LIMIT 1
    `, [deviceId]);

    if (rows.length === 0) return res.json({ success: true, data: [] });

    const payload = typeof rows[0].Data_Payload === 'string' ? JSON.parse(rows[0].Data_Payload) : rows[0].Data_Payload;
    const formattedData = Object.entries(payload).map(([key, val]) => ({
      Variable: key,
      Value: val,
      RecordedAt: rows[0].RecordedAt
    }));

    res.json({ success: true, data: formattedData });
  } catch (err) {
    console.error('[readings] getLatestReadings error:', err);
    res.status(500).json({ success: false, message: 'Erro interno.' });
  }
}

// GET /api/devices/:id/readings/history — Arquitetura Híbrida
async function getReadingHistory(req, res) {
  try {
    const { id: deviceHash } = req.params;
    const { variable, granularity = 'hour', from, to } = req.query;

    if (!variable) return res.status(400).json({ success: false, message: 'Parâmetro "variable" é obrigatório.' });

    const deviceId = await getInternalId(deviceHash);
    if (!deviceId) return res.status(404).json({ success: false, message: 'Dispositivo não encontrado.' });

    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate   = to   ? new Date(to)   : new Date();

    // 1. RAW: Apenas lê a Real_Time_Data
    if (granularity === 'raw') {
      const [rows] = await pool.query(`
        SELECT 
          Data_Payload->>? AS Value, 
          Data_Time_Stamp AS Timestamp
        FROM Real_Time_Data
        WHERE Device_Id = ?
          AND Data_Time_Stamp BETWEEN ? AND ?
          AND JSON_EXTRACT(Data_Payload, CONCAT('$.', ?)) IS NOT NULL
        ORDER BY Data_Time_Stamp ASC
        LIMIT 2000
      `, [ `$.${variable}`, deviceId, fromDate, toDate, variable ]);
      
      return res.json({ success: true, data: rows, meta: { variable, granularity, from: fromDate, to: toDate } });
    }

    // 2. AGREGADO: Formatações de Data
    const formatMap = {
      minute: '%Y-%m-%d %H:%i:00',
      hour:   '%Y-%m-%d %H:00:00',
      day:    '%Y-%m-%d 00:00:00',
    };
    const fmt = formatMap[granularity] || formatMap.hour;

    // 2.1 Query ao Histórico Consolidado (Rápido)
    const [histRows] = await pool.query(`
      SELECT
        AVG(Var_Avg) AS Value,
        DATE_FORMAT(Data_Time_Stamp, ?) AS Timestamp
      FROM Historical_Data
      WHERE Device_Id = ?
        AND Variable = ?
        AND Data_Time_Stamp BETWEEN ? AND ?
      GROUP BY Timestamp
    `, [fmt, deviceId, variable, fromDate, toDate]);

    // 2.2 Query à Real_Time_Data (Agregação JSON on-the-fly para cobrir o dia de hoje)
    const [rtRows] = await pool.query(`
      SELECT
        AVG(Data_Payload->>?) AS Value,
        DATE_FORMAT(Data_Time_Stamp, ?) AS Timestamp
      FROM Real_Time_Data
      WHERE Device_Id = ?
        AND Data_Time_Stamp BETWEEN ? AND ?
        AND JSON_EXTRACT(Data_Payload, CONCAT('$.', ?)) IS NOT NULL
      GROUP BY Timestamp
    `, [`$.${variable}`, fmt, deviceId, fromDate, toDate, variable]);

    // 3. Merge Híbrido: Junta histórico antigo com dados agregados de hoje
    const mergedMap = new Map();
    [...histRows, ...rtRows].forEach(row => {
      // Se houver colisão (ex: meia-noite), faz a média simples das duas tabelas
      if (mergedMap.has(row.Timestamp)) {
        mergedMap.set(row.Timestamp, (mergedMap.get(row.Timestamp) + Number(row.Value)) / 2);
      } else {
        mergedMap.set(row.Timestamp, Number(row.Value));
      }
    });

    // Converte de volta para Array, ordena cronologicamente e limita
    const finalData = Array.from(mergedMap.entries())
      .map(([ts, val]) => ({ Value: val, Timestamp: ts }))
      .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp))
      .slice(0, 2000);

    res.json({ success: true, data: finalData, meta: { variable, granularity, from: fromDate, to: toDate } });
  } catch (err) {
    console.error('[readings] getReadingHistory error:', err);
    res.status(500).json({ success: false, message: 'Erro interno.' });
  }
}

// GET /api/devices/:id/readings/variables
async function getVariables(req, res) {
  try {
    const { id: deviceHash } = req.params;
    const deviceId = await getInternalId(deviceHash);
    if (!deviceId) return res.status(404).json({ success: false, message: 'Dispositivo não encontrado.' });

    const [histRows] = await pool.query('SELECT DISTINCT Variable FROM Historical_Data WHERE Device_Id = ?', [deviceId]);
    const variablesSet = new Set(histRows.map(r => r.Variable));
    
    const [rtRows] = await pool.query(`
      SELECT JSON_KEYS(Data_Payload) AS keys_array 
      FROM Real_Time_Data 
      WHERE Device_Id = ? 
      ORDER BY Data_Time_Stamp DESC 
      LIMIT 20
    `, [deviceId]);

    rtRows.forEach(r => {
      const keys = typeof r.keys_array === 'string' ? JSON.parse(r.keys_array) : r.keys_array;
      if (Array.isArray(keys)) keys.forEach(k => variablesSet.add(k));
    });

    res.json({ success: true, data: Array.from(variablesSet).sort() });
  } catch (err) {
    console.error('[readings] getVariables error:', err);
    res.status(500).json({ success: false, message: 'Erro interno.' });
  }
}

module.exports = { getLatestReadings, getReadingHistory, getVariables };