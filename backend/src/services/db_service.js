const mysql = require('mysql2/promise');
const { database } = require('../config');

// Reaproveitamento de conexões com o banco de dados
let pool;

const getPool = () => {
    if (!pool) {
        pool = mysql.createPool({
            ...database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return pool;
};

const initializeDatabase = async () => {
    /**
     * Função para criar as tabelas simplificadas do banco de dados.
     */
    const connection = await getPool().getConnection();
    try {
        console.log('Verificando e inicializando o banco de dados (versão simplificada)...');

        // Criando a tabela de devices_data (sem owner_id)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS devices_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_id_str VARCHAR(255) NOT NULL UNIQUE,
                name VARCHAR(255),
                description TEXT,
                location VARCHAR(255),
                lat DECIMAL(10,7) NULL,
                lng DECIMAL(10,7) NULL,
                last_seen_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Tabela de tokens de registro: só dispositivos com token válido podem enviar dados
        await connection.query(`
            CREATE TABLE IF NOT EXISTS device_registration_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                token VARCHAR(64) NOT NULL UNIQUE,
                device_id_str VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                description TEXT,
                location VARCHAR(255),
                lat DECIMAL(10,7) NULL,
                lng DECIMAL(10,7) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Criando tabela sensor_data (sem alterações)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS sensor_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_fk INT NOT NULL,
                timestamp DATETIME NOT NULL,
                payload JSON,
                INDEX device_fk_timestamp_idx (device_fk, timestamp DESC),
                FOREIGN KEY (device_fk) REFERENCES devices_data(id) ON DELETE CASCADE
            );
        `);
        // Migração: adicionar colunas novas em tabelas já existentes
        const [cols] = await connection.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'devices_data'`,
            [database.database]
        );
        const has = (name) => cols.some(c => c.COLUMN_NAME === name);
        if (!has('last_seen_at')) {
            await connection.query('ALTER TABLE devices_data ADD COLUMN last_seen_at DATETIME NULL');
        }
        if (!has('lat')) {
            await connection.query('ALTER TABLE devices_data ADD COLUMN lat DECIMAL(10,7) NULL');
        }
        if (!has('lng')) {
            await connection.query('ALTER TABLE devices_data ADD COLUMN lng DECIMAL(10,7) NULL');
        }

        console.log('Banco de dados pronto para uso.');
    } catch (error) {
        console.error('Falha ao inicializar o banco de dados:', error);
        process.exit(1);
    } finally {
        connection.release();
    }
};

const findOrCreateDevice = async (deviceIdStr, metadata = null) => {
    /**
     * Procura por um dispositivo. Se não encontrar, cria um novo (com metadata se fornecida).
     * Retorna o ID numérico do dispositivo.
     */
    const pool = getPool();
    let [rows] = await pool.execute('SELECT id FROM devices_data WHERE device_id_str = ?', [deviceIdStr]);

    if (rows.length > 0) {
        return rows[0].id;
    }
    const name = (metadata && metadata.name) ? metadata.name : deviceIdStr;
    const description = (metadata && metadata.description) != null ? metadata.description : '';
    const location = (metadata && metadata.location) != null ? metadata.location : null;
    const [result] = await pool.execute(
        'INSERT INTO devices_data (device_id_str, name, description, location, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
        [
            deviceIdStr,
            name,
            description,
            location,
            metadata && metadata.lat != null ? metadata.lat : null,
            metadata && metadata.lng != null ? metadata.lng : null
        ]
    );
    console.log(`[DB] Novo dispositivo registrado automaticamente: ${deviceIdStr} com ID: ${result.insertId}`);
    return result.insertId;
};

const updateDeviceLastSeen = async (deviceFk) => {
    const pool = getPool();
    await pool.execute('UPDATE devices_data SET last_seen_at = NOW() WHERE id = ?', [deviceFk]);
};

const getRegistrationByToken = async (token) => {
    const pool = getPool();
    const [rows] = await pool.execute(
        'SELECT device_id_str, name, description, location, lat, lng FROM device_registration_tokens WHERE token = ?',
        [token]
    );
    return rows[0] || null;
};

const deviceIdExists = async (deviceIdStr) => {
    const pool = getPool();
    const [inDevices] = await pool.execute('SELECT 1 FROM devices_data WHERE device_id_str = ?', [deviceIdStr]);
    if (inDevices.length > 0) return true;
    const [inTokens] = await pool.execute('SELECT 1 FROM device_registration_tokens WHERE device_id_str = ?', [deviceIdStr]);
    return inTokens.length > 0;
};

const generateUniqueDeviceId = async () => {
    const crypto = require('crypto');
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
        const candidate = 'device_' + Date.now().toString(36) + '_' + crypto.randomBytes(8).toString('hex');
        const exists = await deviceIdExists(candidate);
        if (!exists) return candidate;
    }
    throw new Error('Não foi possível gerar um ID único para o dispositivo');
};

const createRegistrationToken = async (deviceIdStr, metadata) => {
    const pool = getPool();
    const token = require('crypto').randomBytes(32).toString('hex');
    const name = metadata.name || deviceIdStr;
    const description = metadata.description || '';
    const location = metadata.location || null;
    const lat = metadata.lat ?? null;
    const lng = metadata.lng ?? null;
    await pool.execute(
        `INSERT INTO device_registration_tokens (token, device_id_str, name, description, location, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [token, deviceIdStr, name, description, location, lat, lng]
    );
    await pool.execute(
        `INSERT INTO devices_data (device_id_str, name, description, location, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [deviceIdStr, name, description, location, lat, lng]
    );
    return token;
};

const insertSensorData = async (deviceIdStr, data, metadata = null) => {
    /**
     * Insere o payload JSON de um sensor no banco de dados.
     * Atualiza last_seen_at do dispositivo.
     */
    try {
        const deviceFk = await findOrCreateDevice(deviceIdStr, metadata);
        const sql = 'INSERT INTO sensor_data (device_fk, timestamp, payload) VALUES (?, ?, ?)';
        const timestamp = new Date();
        await getPool().execute(sql, [deviceFk, timestamp, JSON.stringify(data)]);
        await updateDeviceLastSeen(deviceFk);
        console.log(`[DB] Payload do dispositivo ${deviceIdStr} (ID: ${deviceFk}) inserido com sucesso.`);
    } catch (error) {
        console.error(`[DB] Falha ao inserir payload para o dispositivo ${deviceIdStr}:`, error);
    }
};

const getAllDevices = async (onlineOnly = false) => {
    const pool = getPool();
    let sql = 'SELECT id, device_id_str, name, description, location, last_seen_at, created_at FROM devices_data';
    if (onlineOnly) {
        sql += ' WHERE last_seen_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)';
    }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(sql);
    return rows;
};

const getDeviceById = async (deviceIdStr) => {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT * FROM devices_data WHERE device_id_str = ?', [deviceIdStr]);
    return rows[0];
};

const getHistoricalData = async (deviceIdStr, type, variable, startDate, endDate) => {
    const pool = getPool();
    let format;

    // Ajuste da granularidade conforme solicitado para os formatos de eixo X
    if (type === 'minutal') format = '%Y-%m-%d %H:%i'; // Formato para HH:mm
    else if (type === 'hourly') format = '%Y-%m-%d %H:00';
    else format = '%Y-%m-%d'; // Formato para dia-mes-ano

    const sql = `
        SELECT 
            DATE_FORMAT(sd.timestamp, ?) as time,
            AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(sd.payload, CONCAT('$.', ?))) AS DECIMAL(10,2))) as avg_val,
            MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(sd.payload, CONCAT('$.', ?))) AS DECIMAL(10,2))) as max_val,
            MIN(CAST(JSON_UNQUOTE(JSON_EXTRACT(sd.payload, CONCAT('$.', ?))) AS DECIMAL(10,2))) as min_val
        FROM sensor_data sd
        JOIN devices_data dd ON sd.device_fk = dd.id
        WHERE dd.device_id_str = ? 
          AND sd.timestamp BETWEEN ? AND ?
        GROUP BY time
        ORDER BY time ASC
    `;

    const [rows] = await pool.execute(sql, [format, variable, variable, variable, deviceIdStr, startDate, endDate]);

    return {
        labels: rows.map(r => r.time),
        avg: rows.map(r => r.avg_val), 
        max: rows.map(r => r.max_val),
        min: rows.map(r => r.min_val)
    };
}

const getDeviceLimits = async (deviceIdStr) => {
    const pool = getPool();
    const sql = `
        SELECT MIN(timestamp) as first, MAX(timestamp) as last 
        FROM sensor_data sd
        JOIN devices_data dd ON sd.device_fk = dd.id
        WHERE dd.device_id_str = ?
    `;

    const [rows] = await pool.execute(sql, [deviceIdStr]);
    return rows[0];
};

module.exports = {
    initializeDatabase,
    insertSensorData,
    getAllDevices,
    getDeviceById,
    getHistoricalData,
    getDeviceLimits,
    getRegistrationByToken,
    createRegistrationToken,
    generateUniqueDeviceId
};