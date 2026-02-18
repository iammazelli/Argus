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
        console.log('Banco de dados pronto para uso.');
    } catch (error) {
        console.error('Falha ao inicializar o banco de dados:', error);
        process.exit(1);
    } finally {
        connection.release();
    }
};

const findOrCreateDevice = async (deviceIdStr) => {
    /**
     * Procura por um dispositivo. Se não encontrar, cria um novo.
     * Retorna o ID numérico do dispositivo.
     */
    const pool = getPool();
    let [rows] = await pool.execute('SELECT id FROM devices_data WHERE device_id_str = ?', [deviceIdStr]);

    if (rows.length > 0) {
        return rows[0].id;
    } else {
        // Query de inserção simplificada, sem owner_id
        const [result] = await pool.execute(
            'INSERT INTO devices_data (device_id_str, name) VALUES (?, ?)',
            [deviceIdStr, deviceIdStr]
        );
        console.log(`[DB] Novo dispositivo registrado automaticamente: ${deviceIdStr} com ID: ${result.insertId}`);
        return result.insertId;
    }
};

const insertSensorData = async (deviceIdStr, data) => {
    /**
     * Insere o payload JSON de um sensor no banco de dados.
     */
    try {
        const deviceFk = await findOrCreateDevice(deviceIdStr);
        const sql = 'INSERT INTO sensor_data (device_fk, timestamp, payload) VALUES (?, ?, ?)';
        const timestamp = new Date();
        await getPool().execute(sql, [deviceFk, timestamp, JSON.stringify(data)]);
        console.log(`[DB] Payload do dispositivo ${deviceIdStr} (ID: ${deviceFk}) inserido com sucesso.`);
    } catch (error) {
        console.error(`[DB] Falha ao inserir payload para o dispositivo ${deviceIdStr}:`, error);
    }
};

const getAllDevices = async () => {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT id, device_id_str, name, description, location, created_at FROM devices_data ORDER BY created_at DESC');
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
    getDeviceLimits
};