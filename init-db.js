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

    console.log('⏳ Creando tablas en la base de datos...');
    await pool.query(sql);
    console.log('✅ ¡Tablas creadas con éxito!');
    
    // --- NUEVA SECCIÓN PARA CREAR USUARIO ---
    console.log('⏳ Creando usuario administrador de prueba...');
    const insertUserQuery = `
      INSERT INTO users (cedula, nombre, email, password, rol) 
      VALUES ('1234567890', 'Admin', 'admin@ucp.edu.co', '123456', 'admin')
      ON CONFLICT (cedula) DO NOTHING;
    `;
    await pool.query(insertUserQuery);
    console.log('✅ Usuario administrador listo (Cédula: 1234567890, Pass: 123456)');
    // ----------------------------------------

  } catch (err) {
    console.error('❌ Error ejecutando migración:', err);
  } finally {
    await pool.end();
  }
}

runMigration();