const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Usamos la URL que me pasaste
const connectionString = 'postgresql://admin:CTiI8i1tL6L6jZKdbKNFrIsRHvS6HgQr@dpg-d7qmo4flk1mc73cl1iug-a/agenda_db_jobi';

const pool = new Pool({
  connectionString: connectionString,
});

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('⏳ Creando tablas y triggers...');
    await pool.query(sql);
    console.log('✅ Estructura de base de datos lista.');
    
    // INSERT CORREGIDO CON TUS COLUMNAS REALES
    console.log('⏳ Insertando usuario administrador...');
    const insertUserQuery = `
      INSERT INTO users (
        first_name, 
        first_last_name, 
        cc, 
        email, 
        password, 
        id_rol, 
        id_state
      ) 
      VALUES (
        'Admin', 
        'UCP', 
        '1234567890', 
        'admin@ucp.edu.co', 
        '12345678', 
        1, 
        1
      )
      ON CONFLICT (cc) DO NOTHING;
    `;
    
    await pool.query(insertUserQuery);
    console.log('✅ Usuario administrador listo.');
    console.log('👉 CC: 1234567890 | Pass: 123456');

  } catch (err) {
    console.error('❌ Error en la migración:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();