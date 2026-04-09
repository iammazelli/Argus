const express = require('express');
const mysql = require('mysql2/promise')
const path = require('path')

const app = express();
const PORT = 8081;

const pool = mysql.createPool({
    host: process.env.DB_HOST_INTERNAL,
    user: process.env.DB_FRONTEND_USER,
    password: process.env.DB_FRONTEND_USER_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true
});

app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/api/health', (req,res) => res.json({status: 'Servidor frontend OK'}));

app.get('/api/devices', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        d.Device_Hash AS DeviceId,
        d.Device_Name AS Name,
        ST_X(d.Device_Location) AS Latitude,
        ST_Y(d.Device_Location) AS Longitude,
        IF(d.Device_Last_Seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE), 1, 0) AS IsOnline,
        d.Device_Last_Seen AS LastSeenAt,
        (
          SELECT Data_Payload FROM Real_Time_Data r 
          WHERE r.Device_Id = d.Device_Id 
          ORDER BY r.Data_Time_Stamp DESC LIMIT 1
        ) AS LatestReadings
      FROM Devices d
      WHERE d.Device_Is_Active = TRUE
      ORDER BY d.Device_Name ASC
    `);
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro na base de dados.' });
  }
});

async function getInternalId(deviceHash) {
  const [rows] = await pool.query('SELECT Device_Id FROM Devices WHERE Device_Hash = ?', [deviceHash]);
  return rows.length > 0 ? rows[0].Device_Id : null;
}

// Rota: Detalhes do Dispositivo
app.get('/api/devices/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.Device_Hash AS DeviceId, d.Device_Name AS Name, ST_X(d.Device_Location) AS Latitude, ST_Y(d.Device_Location) AS Longitude,
      IF(d.Device_Last_Seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE), 1, 0) AS IsOnline, d.Device_Last_Seen AS LastSeenAt
      FROM Devices d WHERE d.Device_Hash = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Dispositivo não encontrado' });
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rota: Últimas Leituras (Tempo Real)
app.get('/api/devices/:id/readings/latest', async (req, res) => {
  try {
    const deviceId = await getInternalId(req.params.id);
    if (!deviceId) return res.status(404).json({ data: [] });

    const [rows] = await pool.query(`
      SELECT Data_Payload, Data_Time_Stamp AS RecordedAt FROM Real_Time_Data 
      WHERE Device_Id = ? ORDER BY Data_Time_Stamp DESC LIMIT 1
    `, [deviceId]);
    
    if (!rows.length) return res.json({ data: [] });
    
    const payload = typeof rows[0].Data_Payload === 'string' ? JSON.parse(rows[0].Data_Payload) : rows[0].Data_Payload;
    const formattedData = Object.entries(payload).map(([k, v]) => ({ Variable: k, Value: v, RecordedAt: rows[0].RecordedAt }));
    res.json({ data: formattedData });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rota: Variáveis Disponíveis (Select do Gráfico)
app.get('/api/devices/:id/readings/variables', async (req, res) => {
  try {
    const deviceId = await getInternalId(req.params.id);
    if (!deviceId) return res.status(404).json({ data: [] });

    const [histRows] = await pool.query('SELECT DISTINCT Variable FROM Historical_Data WHERE Device_Id = ?', [deviceId]);
    const variablesSet = new Set(histRows.map(r => r.Variable));
    
    const [rtRows] = await pool.query('SELECT JSON_KEYS(Data_Payload) AS keys_array FROM Real_Time_Data WHERE Device_Id = ? ORDER BY Data_Time_Stamp DESC LIMIT 20', [deviceId]);
    rtRows.forEach(r => {
      const keys = typeof r.keys_array === 'string' ? JSON.parse(r.keys_array) : r.keys_array;
      if (Array.isArray(keys)) keys.forEach(k => variablesSet.add(k));
    });
    
    res.json({ data: Array.from(variablesSet).sort() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rota: Histórico Híbrido (Gráficos)
app.get('/api/devices/:id/readings/history', async (req, res) => {
  try {
    const { variable, granularity = 'hour', from, to } = req.query;
    const deviceId = await getInternalId(req.params.id);
    if (!deviceId || !variable) return res.status(400).json({ error: 'Parâmetros inválidos' });

    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    if (granularity === 'raw') {
      const [rows] = await pool.query(`
        SELECT Data_Payload->>? AS Value, Data_Time_Stamp AS Timestamp FROM Real_Time_Data
        WHERE Device_Id = ? AND Data_Time_Stamp BETWEEN ? AND ? AND JSON_EXTRACT(Data_Payload, CONCAT('$.', ?)) IS NOT NULL
        ORDER BY Data_Time_Stamp ASC LIMIT 2000
      `, [`$.${variable}`, deviceId, fromDate, toDate, variable]);
      return res.json({ data: rows });
    }

    const fmt = granularity === 'minute' ? '%Y-%m-%d %H:%i:00' : granularity === 'day' ? '%Y-%m-%d 00:00:00' : '%Y-%m-%d %H:00:00';
    
    const [histRows] = await pool.query(`SELECT AVG(Var_Avg) AS Value, DATE_FORMAT(Data_Time_Stamp, ?) AS Timestamp FROM Historical_Data WHERE Device_Id = ? AND Variable = ? AND Data_Time_Stamp BETWEEN ? AND ? GROUP BY Timestamp`, [fmt, deviceId, variable, fromDate, toDate]);
    const [rtRows] = await pool.query(`SELECT AVG(Data_Payload->>?) AS Value, DATE_FORMAT(Data_Time_Stamp, ?) AS Timestamp FROM Real_Time_Data WHERE Device_Id = ? AND Data_Time_Stamp BETWEEN ? AND ? AND JSON_EXTRACT(Data_Payload, CONCAT('$.', ?)) IS NOT NULL GROUP BY Timestamp`, [`$.${variable}`, fmt, deviceId, fromDate, toDate, variable]);

    const mergedMap = new Map();
    [...histRows, ...rtRows].forEach(row => {
      mergedMap.set(row.Timestamp, mergedMap.has(row.Timestamp) ? (mergedMap.get(row.Timestamp) + Number(row.Value)) / 2 : Number(row.Value));
    });

    res.json({ data: Array.from(mergedMap.entries()).map(([ts, val]) => ({ Value: val, Timestamp: ts })).sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp)).slice(0, 2000) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FRONTEND] Servidor de leitura a correr na porta ${PORT}`);
});