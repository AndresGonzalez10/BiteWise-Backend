import { Request, Response } from 'express';
import pool from '../config/db';

export const getAllRecipes = async (_req: Request, res: Response) => {
  try {
    const query = `
      SELECT r.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'name', ing.name, 
                   'quantity', ri.required_quantity, 
                   'unit', ing.unit_default
                 )
               ) FILTER (WHERE ing.id IS NOT NULL), '[]'
             ) as ingredients
      FROM recipes r
      LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      LEFT JOIN ingredients ing ON ri.ingredient_id = ing.id
      GROUP BY r.id
      ORDER BY r.id ASC;
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener recetas:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};