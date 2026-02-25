import { Request, Response } from 'express';
import pool from '../config/db';

export const getInventory = async (_req: Request, res: Response) => {
  try {
    const query = 'SELECT * FROM ingredients';
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener los ingredientes:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

interface InventoryBody {
  user_id: string;
  ingredient_id: number;
  current_quantity: number;
}

export const addInventoryItem = async (req: Request<{}, {}, InventoryBody>, res: Response) => {
  const { user_id, ingredient_id, current_quantity } = req.body;
  try {
    const query = `
      INSERT INTO inventory (user_id, ingredient_id, current_quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, ingredient_id) 
      DO UPDATE SET current_quantity = inventory.current_quantity + $3, updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const result = await pool.query(query, [user_id, ingredient_id, current_quantity]);
    res.status(201).json({
      message: 'Ingrediente añadido al inventario',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Error al añadir al inventario:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
};