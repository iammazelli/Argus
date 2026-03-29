const cron = require('node-cron');
const { pool } = require('../config/database');

// Função auxiliar para calcular Desvio Padrão
function calculateStdDev(values, avg) {
  if (values.length <= 1) return 0;
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

async function runDailyAggregation() {
  console.log('[JOB] A iniciar agregação diária de dados em tempo real...');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Determinar o limite seguro (evitar apagar dados que cheguem durante o job)
    const [maxIdRow] = await conn.query('SELECT MAX(Id) as maxId FROM Real_Time_Data');
    const maxId = maxIdRow[0].maxId;

    if (!maxId) {
      console.log('[JOB] Nenhum dado para processar hoje.');
      await conn.commit();
      return;
    }

    // 2. Extrair os dados brutos (até ao maxId)
    const [rows] = await conn.query(
      'SELECT Id, Device_Id, Data_Payload, Data_Time_Stamp FROM Real_Time_Data WHERE Id <= ?',
      [maxId]
    );

    // Estrutura de agregação em memória
    // Chave: "deviceId_timestampJanela10Min_variavel"
    const buckets = {};

    rows.forEach(row => {
      const payload = typeof row.Data_Payload === 'string' ? JSON.parse(row.Data_Payload) : row.Data_Payload;
      
      // Arredondar timestamp para a janela de 10 minutos mais próxima (em milissegundos)
      const coeff = 1000 * 60 * 10;
      const windowTime = new Date(Math.floor(new Date(row.Data_Time_Stamp).getTime() / coeff) * coeff);
      const timeStr = windowTime.toISOString().slice(0, 19).replace('T', ' '); // Formato MySQL

      for (const [variable, value] of Object.entries(payload)) {
        if (typeof value !== 'number') continue;

        const key = `${row.Device_Id}_${timeStr}_${variable}`;
        
        if (!buckets[key]) {
          buckets[key] = {
            deviceId: row.Device_Id,
            variable: variable,
            timestamp: timeStr,
            values: []
          };
        }
        buckets[key].values.push(value);
      }
    });

    // 3. Calcular métricas e preparar Bulk Insert
    const insertData = [];
    for (const key in buckets) {
      const b = buckets[key];
      const sum = b.values.reduce((a, val) => a + val, 0);
      const avg = sum / b.values.length;
      const min = Math.min(...b.values);
      const max = Math.max(...b.values);
      const std = calculateStdDev(b.values, avg);

      insertData.push([b.deviceId, b.variable, avg, min, max, std, b.timestamp]);
    }

    // 4. Inserir no Histórico (em Bulk para alta performance)
    if (insertData.length > 0) {
      await conn.query(`
        INSERT INTO Historical_Data 
        (Device_Id, Variable, Var_Avg, Var_Min, Var_Max, Var_Std, Data_Time_Stamp) 
        VALUES ?
      `, [insertData]);
    }

    // 5. Limpar APENAS os dados processados na Real_Time_Data
    await conn.query('DELETE FROM Real_Time_Data WHERE Id <= ?', [maxId]);

    await conn.commit();
    console.log(`[JOB] Agregação concluída: ${rows.length} registos brutos transformados em ${insertData.length} métricas analíticas.`);

  } catch (err) {
    await conn.rollback();
    console.error('[JOB] Erro crítico na agregação. Rollback efetuado.', err);
  } finally {
    conn.release();
  }
}

// Orquestração: Executa todos os dias às 00:05
function startJob() {
  cron.schedule('5 0 * * *', () => {
    runDailyAggregation();
  }, {
    timezone: "America/Sao_Paulo"
  });
  console.log('[CRON] Job de agregação diária (10 min buckets) agendado para as 00:05.');
}

module.exports = { startJob, runDailyAggregation };