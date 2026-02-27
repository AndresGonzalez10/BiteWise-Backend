import { Request, Response } from 'express';
import pool from '../config/db';

export const getInventory = async (req: Request, res: Response) => {
  const { user_id } = req.params; 

  try {
    const query = `
      SELECT 
        inv.id AS inventory_record_id,
        ing.id AS ingredient_id,
        ing.name,
        ing.category,
        inv.current_quantity,
        ing.unit_default
      FROM inventory inv
      JOIN ingredients ing ON inv.ingredient_id = ing.id
      WHERE inv.user_id = $1
      ORDER BY ing.name ASC;
    `;
    
    const result = await pool.query(query, [user_id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener el inventario:', error);
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