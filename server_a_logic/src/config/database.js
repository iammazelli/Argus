const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'argus-mysql',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'argus',
  password: process.env.DB_PASSWORD || 'argus@2024',
  database: process.env.DB_NAME     || process.env.DB_DATABASE || 'ArgusDB',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-03:00',
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('[DB] Conexão com MySQL estabelecida com sucesso.');
    conn.release();
  } catch (err) {
    console.error('[DB] Falha ao conectar ao MySQL:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };