import fs from 'fs';
import path from 'path';
import pool from '../config/db.js';

async function runMigrations() {
  const migrationsDir = path.dirname(new URL(import.meta.url).pathname);
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    try {
      console.log(`Executando: ${file}`);
      await pool.query(sql);
      console.log(`✓ ${file} completado`);
    } catch (error) {
      console.error(`✗ Erro em ${file}:`, error);
      process.exit(1);
    }
  }

  console.log('✓ Todas as migrações foram executadas com sucesso');
  process.exit(0);
}

runMigrations();
