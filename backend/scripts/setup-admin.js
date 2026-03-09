#!/usr/bin/env node
/**
 * Setup Admin User
 * Run: node scripts/setup-admin.js
 *
 * Creates (or resets) the admin user with a proper bcrypt hash.
 */
'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DEFAULT_EMAIL = process.env.ADMIN_EMAIL || 'admin@dashboard.com';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('⚙️  Gerando hash bcrypt para a senha admin...');
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  console.log('📦 Inserindo usuário admin no banco...');
  await pool.query(`
    INSERT INTO clients (name, email, password_hash, role, is_active)
    VALUES ($1, $2, $3, 'admin', true)
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role          = 'admin',
          is_active     = true,
          updated_at    = NOW()
  `, ['Admin', DEFAULT_EMAIL, hash]);

  console.log(`✅ Admin criado com sucesso!`);
  console.log(`   Email: ${DEFAULT_EMAIL}`);
  console.log(`   Senha: ${DEFAULT_PASSWORD}`);
  console.log(`\n⚠️  ALTERE A SENHA IMEDIATAMENTE após o primeiro login!`);

  await pool.end();
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
