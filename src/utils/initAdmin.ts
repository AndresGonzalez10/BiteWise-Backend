import pool from '../config/db';
import bcrypt from 'bcrypt';

export const initializeAdmin = async () => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn('⚠️  ADVERTENCIA: Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el archivo .env. No se creará el Administrador automático.');
    return; 
  }

  try {
    const checkUser = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);

    if (checkUser.rowCount === 0) {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

      const insertQuery = `
        INSERT INTO users (name, email, password_hash, role) 
        VALUES ($1, $2, $3, 'administrador')
      `;
      
      await pool.query(insertQuery, ['Admin', adminEmail, hashedPassword]);
      console.log('🛡️  Cuenta de Administrador creada de forma 100% segura desde el .env');
    } else {
      console.log('🛡️  La cuenta de Administrador ya existe. Todo en orden.');
    }
  } catch (error) {
    console.error('❌ Error al inicializar el administrador:', error);
  }
};