const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST,     
  port:     parseInt(process.env.DB_PORT), 
  user:     process.env.DB_USER,     
  password: process.env.DB_PASSWORD, 
  database: process.env.DB_DATABASE, 
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