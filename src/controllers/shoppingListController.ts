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

    const recipeRes = await client.query('SELECT title FROM recipes WHERE id = $1', [recipe_id]);
    if (recipeRes.rowCount === 0) throw new Error('Receta no encontrada');
    const recipeTitle = recipeRes.rows[0].title;

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

    if (missingItems.length === 0) {
      throw new Error('¡Ya tienes todos los ingredientes para esta receta!');
    }

    const listName = `Faltantes para: ${recipeTitle}`;
    const listQuery = `INSERT INTO shopping_lists (user_id, name) VALUES ($1, $2) RETURNING id`;
    const listRes = await client.query(listQuery, [user_id, listName]);
    const listId = listRes.rows[0].id;

    const itemQuery = `
      INSERT INTO shopping_list_items (list_id, ingredient_id, target_quantity, total_price)
      VALUES ($1, $2, $3, $4)
    `;
    
    for (const item of missingItems) {
      const estimatedPrice = item.unit_price * item.missing_qty; 
      await client.query(itemQuery, [listId, item.ingredient_id, item.missing_qty, estimatedPrice]);
    }

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

export const getShoppingList = async (req: Request, res: Response) => {
  const { list_id } = req.params;

  try {
    const listQuery = `SELECT id, name, created_at FROM shopping_lists WHERE id = $1`;
    const listResult = await pool.query(listQuery, [list_id]);

    if (listResult.rowCount === 0) {
      res.status(404).json({ error: 'Lista de compras no encontrada' });
      return;
    }

    const list = listResult.rows[0];
    const itemsQuery = `
      SELECT 
        sli.id AS item_id,
        ing.id AS ingredient_id,
        ing.name AS ingredient_name,
        sli.target_quantity AS missing_quantity,
        ing.unit_default AS unit,
        sli.total_price AS estimated_price
      FROM shopping_list_items sli
      JOIN ingredients ing ON sli.ingredient_id = ing.id
      WHERE sli.list_id = $1
      ORDER BY ing.name ASC;
    `;
    const itemsResult = await pool.query(itemsQuery, [list_id]);
    res.json({
      list_id: list.id,
      list_name: list.name,
      created_at: list.created_at,
      total_items: itemsResult.rowCount,
      items: itemsResult.rows
    });

  } catch (error) {
    console.error('Error al obtener la lista de compras:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};