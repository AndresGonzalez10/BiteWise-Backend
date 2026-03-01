import { Request, Response } from 'express';
import pool from '../config/db';

interface GenerateListBody {
  user_id: string;
  recipe_id: number;
}

export const generateListFromRecipe = async (req: Request<{}, {}, GenerateListBody>, res: Response) => {
  const { user_id, recipe_id } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Obtenemos el nombre de la receta para titular la lista
    const recipeRes = await client.query('SELECT title FROM recipes WHERE id = $1', [recipe_id]);
    if (recipeRes.rowCount === 0) throw new Error('Receta no encontrada');
    const recipeTitle = recipeRes.rows[0].title;

    // 2. Calculamos EXACTAMENTE qué le falta al usuario (Receta - Inventario)
    const missingQuery = `
      SELECT 
        ri.ingredient_id, 
        ing.unit_price,
        (ri.required_quantity - COALESCE(inv.current_quantity, 0)) AS missing_qty
      FROM recipe_ingredients ri
      JOIN ingredients ing ON ri.ingredient_id = ing.id
      LEFT JOIN inventory inv ON inv.ingredient_id = ri.ingredient_id AND inv.user_id = $1
      WHERE ri.recipe_id = $2
      AND (ri.required_quantity - COALESCE(inv.current_quantity, 0)) > 0;
    `;
    const { rows: missingItems } = await client.query(missingQuery, [user_id, recipe_id]);

    // Si el arreglo viene vacío, significa que ya tiene todo
    if (missingItems.length === 0) {
      throw new Error('¡Ya tienes todos los ingredientes para esta receta!');
    }

    // 3. Creamos la "cabecera" de la lista de compras
    const listName = `Faltantes para: ${recipeTitle}`;
    const listQuery = `INSERT INTO shopping_lists (user_id, name) VALUES ($1, $2) RETURNING id`;
    const listRes = await client.query(listQuery, [user_id, listName]);
    const listId = listRes.rows[0].id;

    // 4. Insertamos cada ingrediente faltante en los items de la lista
    const itemQuery = `
      INSERT INTO shopping_list_items (list_id, ingredient_id, target_quantity, total_price)
      VALUES ($1, $2, $3, $4)
    `;
    
    for (const item of missingItems) {
      // Estimamos el precio multiplicando lo que falta por el precio unitario de la base de datos
      const estimatedPrice = item.unit_price * item.missing_qty; 
      await client.query(itemQuery, [listId, item.ingredient_id, item.missing_qty, estimatedPrice]);
    }

    // Confirmamos la transacción
    await client.query('COMMIT');
    res.status(201).json({ 
      message: 'Lista de compras generada con éxito',
      list_id: listId,
      items_added: missingItems.length
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error al generar lista de compras:', error.message);
    res.status(400).json({ error: error.message || 'Error en el servidor' });
  } finally {
    client.release();
  }
};