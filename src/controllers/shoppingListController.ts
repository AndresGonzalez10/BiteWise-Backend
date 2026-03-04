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

export const getShoppingList = async (req: Request, res: Response): Promise<void> => {
  const { list_id } = req.params; 
  const { user_id } = req.query;  

  if (!user_id) {
    res.status(400).json({ error: 'Debes proporcionar tu user_id para verificar tu identidad.' });
    return;
  }

  try {
    const listQuery = `SELECT id, name, created_at FROM shopping_lists WHERE id = $1 AND user_id = $2`;
    const listResult = await pool.query(listQuery, [list_id, user_id]);

    if (listResult.rowCount === 0) {
      res.status(404).json({ error: 'La lista de compras no existe o no tienes permiso para verla.' });
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

export const purchaseList = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; 
  const { user_id } = req.body; 
  if (!id || !user_id) {
    res.status(400).json({ error: 'Faltan datos: id de la lista o user_id.' });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const itemsQuery = await client.query(
      'SELECT ingredient_id, target_quantity FROM shopping_list_items WHERE list_id = $1',
      [id]
    );

    const items = itemsQuery.rows;

    if (items.length === 0) {
      res.status(404).json({ message: 'La lista de compras está vacía o no existe.' });
      await client.query('ROLLBACK');
      return;
    }

    for (const item of items) {
      await client.query(`
        INSERT INTO inventory (user_id, ingredient_id, current_quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, ingredient_id) 
        DO UPDATE SET 
          current_quantity = inventory.current_quantity + EXCLUDED.current_quantity,
          updated_at = CURRENT_TIMESTAMP
      `, [user_id, item.ingredient_id, item.target_quantity]);
    }

    await client.query('COMMIT');

    res.json({
      message: '¡Compra exitosa! Tu despensa virtual ha sido actualizada. La lista se ha conservado.',
      items_added: items.length
    });

  } catch (error) {
    await client.query('ROLLBACK'); 
    console.error('Error al procesar la compra:', error);
    res.status(500).json({ error: 'Error al actualizar el inventario.' });
  } finally {
    client.release();
  }
};
// 🗑️ ELIMINAR LISTA DE COMPRAS (Solo el dueño)
export const deleteShoppingList = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { user_id } = req.body; 

  if (!user_id) {
    res.status(400).json({ error: 'Debes proporcionar tu user_id para verificar tu identidad.' });
    return;
  }

  try {
    // 🛡️ El candado: Borra solo si el ID de la lista y el ID del usuario coinciden
    // Nota: Como tu tabla shopping_list_items tiene "ON DELETE CASCADE", 
    // al borrar la lista se borrarán automáticamente todos los ingredientes que tenía adentro.
    const query = 'DELETE FROM shopping_lists WHERE id = $1 AND user_id = $2 RETURNING id';
    const result = await pool.query(query, [id, user_id]);

    if (result.rowCount === 0) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esta lista o no existe.' });
      return;
    }

    res.json({ message: 'Lista de compras eliminada exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar la lista:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  }
};

interface UpdateListItems {
  ingredient_id: number;
  target_quantity: number;
}

interface UpdateListBody {
  user_id: string;
  name?: string; // Opcional por si quiere cambiarle el nombre a la lista
  items?: UpdateListItems[]; // Opcional por si quiere agregar/quitar cosas
}

// ✏️ EDITAR LISTA DE COMPRAS (Solo el dueño)
export const updateShoppingList = async (req: Request<{ id: string }, {}, UpdateListBody>, res: Response): Promise<void> => {
  const { id } = req.params;
  const { user_id, name, items } = req.body;

  if (!user_id) {
    res.status(400).json({ error: 'Debes proporcionar el user_id para verificar que eres el dueño.' });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verificamos que sea el dueño legítimo
    const checkAuth = await client.query('SELECT id FROM shopping_lists WHERE id = $1 AND user_id = $2', [id, user_id]);
    if (checkAuth.rowCount === 0) {
      res.status(403).json({ error: 'No tienes permiso para editar esta lista o no existe.' });
      await client.query('ROLLBACK');
      return;
    }

    // 2. Si mandó un nombre nuevo, lo actualizamos
    if (name) {
      await client.query('UPDATE shopping_lists SET name = $1 WHERE id = $2', [name, id]);
    }

    // 3. Si mandó una nueva lista de ingredientes, reemplazamos los viejos
    if (items && Array.isArray(items)) {
      // Borramos los items anteriores
      await client.query('DELETE FROM shopping_list_items WHERE list_id = $1', [id]);

      // 🧠 MAGIA SQL: Insertamos los nuevos y multiplicamos la cantidad por el precio (unit_price) directamente en la base de datos
      const insertItemQuery = `
        INSERT INTO shopping_list_items (list_id, ingredient_id, target_quantity, total_price)
        SELECT $1, $2, $3, ($3 * unit_price)
        FROM ingredients 
        WHERE id = $2
      `;

      for (const item of items) {
        await client.query(insertItemQuery, [id, item.ingredient_id, item.target_quantity]);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Lista de compras actualizada con éxito.' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al editar la lista:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  } finally {
    client.release();
  }
};