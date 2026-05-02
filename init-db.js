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
    // Leemos el archivo que vimos en tu carpeta migrations
    const sqlPath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('⏳ Creando tablas en la base de datos...');
    await pool.query(sql);
    console.log('✅ ¡Tablas creadas con éxito!');
    
    // Opcional: Insertar un usuario de prueba si no existe
    // await pool.query("INSERT INTO users (cedula, password) VALUES ('1234567890', 'hash_aqui')");

  } catch (err) {
    console.error('❌ Error ejecutando migración:', err);
  } finally {
    await pool.end();
  }
}

runMigration();