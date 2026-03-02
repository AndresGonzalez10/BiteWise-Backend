import { Request, Response } from 'express';
import pool from '../config/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_por_defecto';

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;

  try {
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rowCount && userExists.rowCount > 0) {
      res.status(400).json({ error: 'El correo ya está registrado' });
      return;
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const insertQuery = `
      INSERT INTO users (name, email, password_hash, role) 
      VALUES ($1, $2, $3, 'cliente') 
      RETURNING id, name, email, role, created_at;
    `;
    const newUser = await pool.query(insertQuery, [name, email, hashedPassword]);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: newUser.rows[0]
    });

  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  try {
    const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userQuery.rowCount === 0) {
      res.status(401).json({ error: 'Credenciales inválidas' }); 
      return;
    }

    const user = userQuery.rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }
    const token = jwt.sign(
      { userId: user.id, name: user.name, email: user.email, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login exitoso',
      token, 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role 
      }
    });

  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

// --- ESTADÍSTICAS DEL ADMINISTRADOR ---
export const getAdminStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Contar usuarios registrados (clientes)
    const usersQuery = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'cliente'");
    const totalUsers = parseInt(usersQuery.rows[0].count);

    // 2. Contar cuántas listas de compras se han generado
    const listsQuery = await pool.query("SELECT COUNT(*) FROM shopping_lists");
    const totalLists = parseInt(listsQuery.rows[0].count);

    // 3. Calcular el valor monetario total de todos los ingredientes faltantes
    // (Esto te servirá para tu hipótesis de cuánto dinero se está gestionando)
    const moneyQuery = await pool.query("SELECT SUM(total_price) FROM shopping_list_items");
    const totalMoneyManaged = moneyQuery.rows[0].sum ? parseFloat(moneyQuery.rows[0].sum) : 0;

    res.json({
      message: 'Estadísticas reales obtenidas con éxito',
      stats: {
        total_clientes: totalUsers,
        listas_generadas: totalLists,
        dinero_gestionado_mxn: totalMoneyManaged
      }
    });

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al calcular las estadísticas' });
  }
};