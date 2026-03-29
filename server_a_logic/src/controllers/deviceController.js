const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET /api/devices — Lista todos os dispositivos ativos
async function listDevices(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        d.Device_Hash AS DeviceId,
        d.Device_Name AS Name,
        d.Notification_Email AS Email,
        ST_X(d.Device_Location) AS Latitude,
        ST_Y(d.Device_Location) AS Longitude,
        IF(d.Device_Last_Seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE), 1, 0) AS IsOnline,
        d.Device_Is_Active AS IsActive,
        d.Device_Created_At AS CreatedAt,
        d.Device_Last_Seen AS LastSeenAt,
        (
          SELECT Data_Payload
          FROM Real_Time_Data r
          WHERE r.Device_Id = d.Device_Id
          ORDER BY r.Data_Time_Stamp DESC
          LIMIT 1
        ) AS LatestReadings
      FROM Devices d
      WHERE d.Device_Is_Active = TRUE
      ORDER BY d.Device_Name ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[devices] listDevices error:', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
}

// GET /api/devices/:id — Detalhe de um dispositivo
async function getDevice(req, res) {
  try {
    const { id } = req.params; // 'id' aqui é o Device_Hash vindo do frontend
    const [rows] = await pool.query(`
      SELECT
        d.Device_Hash AS DeviceId,
        d.Device_Name AS Name,
        d.Notification_Email AS Email,
        ST_X(d.Device_Location) AS Latitude,
        ST_Y(d.Device_Location) AS Longitude,
        IF(d.Device_Last_Seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE), 1, 0) AS IsOnline,
        d.Device_Is_Active AS IsActive,
        d.Device_Created_At AS CreatedAt,
        d.Device_Last_Seen AS LastSeenAt
      FROM Devices d
      WHERE d.Device_Hash = ? AND d.Device_Is_Active = TRUE
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Dispositivo não encontrado.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[devices] getDevice error:', err);
    res.status(500).json({ success: false, message: 'Erro interno.' });
  }
}

// POST /api/devices — Cadastro
async function createDevice(req, res) {
  try {
    const { name, email, latitude, longitude } = req.body;

    if (!name || !email || latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: 'Campos obrigatórios: name, email, latitude, longitude.' });
    }

    const deviceHash = uuidv4(); // Gera o Hash único que será o MQTT Topic do ESP32

    await pool.query(`
      INSERT INTO Devices (Device_Hash, Device_Name, Notification_Email, Device_Location)
      VALUES (?, ?, ?, ST_GeomFromText(?, 4326))
    `, [deviceHash, name, email, `POINT(${latitude} ${longitude})`]);

    res.status(201).json({
      success: true,
      message: 'Dispositivo cadastrado com sucesso.',
      data: { deviceId: deviceHash, name, email, latitude, longitude },
    });
  } catch (err) {
    console.error('[devices] createDevice error:', err);
    res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
  }
}

// DELETE /api/devices/:id — Desativa um dispositivo (soft delete)
async function deleteDevice(req, res) {
  try {
    const { id } = req.params;
    await pool.query('UPDATE Devices SET Device_Is_Active = FALSE WHERE Device_Hash = ?', [id]);
    res.json({ success: true, message: 'Dispositivo desativado.' });
  } catch (err) {
    console.error('[devices] deleteDevice error:', err);
    res.status(500).json({ success: false, message: 'Erro interno.' });
  }
}

module.exports = { listDevices, getDevice, createDevice, deleteDevice };