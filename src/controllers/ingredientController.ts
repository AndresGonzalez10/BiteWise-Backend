import { Request, Response } from 'express';
import pool from '../config/db';
export const createIngredient = async (req: Request, res: Response): Promise<void> => {
  const { author_id, name, category, purchase_price, purchase_quantity, unit_default } = req.body;

  if (!author_id || !name || !category) {
    res.status(400).json({ error: 'Faltan datos obligatorios: author_id, name o category.' });
    return;
  }

  let calculatedUnitPrice = 0.05; 
  if (purchase_price !== undefined && purchase_quantity !== undefined && purchase_quantity > 0) {
    calculatedUnitPrice = purchase_price / purchase_quantity;
  }

  try {
    const query = `
      INSERT INTO ingredients (author_id, name, category, unit_price, unit_default)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [author_id, name, category, calculatedUnitPrice, unit_default || 'g'];
    
    const result = await pool.query(query, values);
    
    res.status(201).json({
      message: 'Ingrediente creado. El precio por unidad fue calculado automáticamente.',
      ingredient: result.rows[0]
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Ya existe un ingrediente con ese nombre en la base de datos.' });
      return;
    }
    console.error('Error al crear ingrediente:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
};

export const updateIngredient = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; 
  const { user_id, name, category, purchase_price, purchase_quantity, unit_default } = req.body; 

  if (!user_id) {
    res.status(400).json({ error: 'Debes proporcionar tu user_id para verificar que eres el creador.' });
    return;
  }
  let calculatedUnitPrice = null; 
  if (purchase_price !== undefined && purchase_quantity !== undefined && purchase_quantity > 0) {
    calculatedUnitPrice = purchase_price / purchase_quantity;
  }

  try {
    const query = `
      UPDATE ingredients 
      SET 
        name = COALESCE($1, name), 
        category = COALESCE($2, category), 
        unit_price = COALESCE($3, unit_price), 
        unit_default = COALESCE($4, unit_default)
      WHERE id = $5 AND author_id = $6
      RETURNING *;
    `;
    const values = [name, category, calculatedUnitPrice, unit_default, id, user_id];
    
    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      res.status(403).json({ 
        error: 'No tienes permiso para editar este ingrediente o no existe.' 
      });
      return;
    }

    res.json({
      message: 'Ingrediente actualizado correctamente con el nuevo costo por unidad.',
      ingredient: result.rows[0]
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'El nuevo nombre ya está siendo usado por otro ingrediente.' });
      return;
    }
    console.error('Error al editar ingrediente:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
};