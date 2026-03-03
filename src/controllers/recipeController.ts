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

interface IngredientForRecipe {
  ingredient_id: number;
  required_quantity: number;
}

interface CreateRecipeBody {
  title: string;
  instructions: string;
  image_url?: string;
  author_id: string; 
  ingredients: IngredientForRecipe[]; 
}

export const createRecipe = async (req: Request<{}, {}, CreateRecipeBody>, res: Response) => {
  const { title, instructions, image_url, author_id, ingredients } = req.body;
  
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const recipeQuery = `
      INSERT INTO recipes (title, instructions, image_url, is_custom, author_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `;
    const recipeValues = [title, instructions, image_url || null, true, author_id];
    const recipeResult = await client.query(recipeQuery, recipeValues);
    
    const newRecipeId = recipeResult.rows[0].id;
    if (ingredients && ingredients.length > 0) {
      const ingredientQuery = `
        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, required_quantity)
        VALUES ($1, $2, $3);
      `;
      for (const ing of ingredients) {
        await client.query(ingredientQuery, [newRecipeId, ing.ingredient_id, ing.required_quantity]);
      }
    }
    await client.query('COMMIT');
    
    res.status(201).json({ 
      message: 'Receta creada exitosamente', 
      recipeId: newRecipeId 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear la receta:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  } finally {
    client.release();
  }
};
export const getMatchingRecipes = async (req: Request, res: Response) => {
  const { user_id } = req.params;

  try {
    const query = `
      SELECT 
        r.id AS recipe_id, 
        r.title, 
        r.instructions, 
        r.image_url,
        json_agg(
          json_build_object(
            'ingredient_id', ri.ingredient_id,
            'name', ing.name,
            'required_quantity', ri.required_quantity,
            'unit', ing.unit_default,
            'user_has_quantity', COALESCE(inv.current_quantity, 0) -- Si no tiene, es 0
          )
        ) as ingredients
      FROM recipes r
      JOIN recipe_ingredients ri ON r.id = ri.recipe_id
      JOIN ingredients ing ON ri.ingredient_id = ing.id
      -- Aquí cruzamos con el inventario del usuario específico
      LEFT JOIN inventory inv ON inv.ingredient_id = ri.ingredient_id AND inv.user_id = $1
      GROUP BY r.id
      ORDER BY r.id ASC;
    `;

    const result = await pool.query(query, [user_id]);
    const allRecipes = result.rows;

    const perfectMatch: any[] = [];
    const partialMatch: any[] = [];

    allRecipes.forEach(recipe => {
      let canCookPerfectly = true;
      const missingIngredients: any[] = [];

      
      recipe.ingredients.forEach((ing: any) => {
        if (Number(ing.user_has_quantity) < Number(ing.required_quantity)) {
          canCookPerfectly = false;
          missingIngredients.push({
            ingredient_id: ing.ingredient_id,
            name: ing.name,
            missing_quantity: Number(ing.required_quantity) - Number(ing.user_has_quantity),
            unit: ing.unit
          });
        }
      });

      if (canCookPerfectly) {
        perfectMatch.push(recipe);
      } else {
        partialMatch.push({
          ...recipe,
          missing_ingredients: missingIngredients
        });
      }
    });
    res.json({
      perfectMatch,
      partialMatch
    });

  } catch (error) {
    console.error('Error al calcular el match de recetas:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
};
interface CookRecipeBody {
  user_id: string;
  recipe_id: number;
}

export const cookRecipe = async (req: Request<{}, {}, CookRecipeBody>, res: Response) => {
  const { user_id, recipe_id } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const recipeQuery = `SELECT ingredient_id, required_quantity FROM recipe_ingredients WHERE recipe_id = $1`;
    const { rows: ingredientsNeeded } = await client.query(recipeQuery, [recipe_id]);

    if (ingredientsNeeded.length === 0) {
      throw new Error('La receta no tiene ingredientes o no existe.');
    }

    for (const item of ingredientsNeeded) {
      const updateQuery = `
        UPDATE inventory 
        SET current_quantity = current_quantity - $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2 AND ingredient_id = $3 AND current_quantity >= $1
        RETURNING *;
      `;
      const updateResult = await client.query(updateQuery, [item.required_quantity, user_id, item.ingredient_id]);

      if (updateResult.rowCount === 0) {
        throw new Error(`No tienes suficiente cantidad del ingrediente ID: ${item.ingredient_id} para preparar esta receta.`);
      }
    }
    await client.query('COMMIT');
    res.json({ message: '¡Receta cocinada con éxito! Tu inventario ha sido actualizado.' });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error al cocinar la receta:', error.message);
    res.status(400).json({ error: error.message || 'Error al procesar la solicitud' });
  } finally {
    client.release();
  }
};

// ✏️ EDITAR RECETA (Solo el autor)
export const updateRecipe = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // ID de la receta en la URL
  const { user_id, title, instructions, image_url, ingredients } = req.body;

  if (!user_id) {
    res.status(400).json({ error: 'Debes proporcionar el user_id para verificar que eres el autor.' });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); // Iniciamos la transacción segura

    // 1. Verificamos que la receta exista y que el usuario sea el verdadero autor
    const checkAuth = await client.query('SELECT id FROM recipes WHERE id = $1 AND author_id = $2', [id, user_id]);
    
    if (checkAuth.rowCount === 0) {
      res.status(403).json({ error: 'No tienes permiso para editar esta receta (es global o de otro usuario), o no existe.' });
      await client.query('ROLLBACK');
      return;
    }

    // 2. Actualizamos los datos básicos de la receta
    const updateQuery = `
      UPDATE recipes 
      SET 
        title = COALESCE($1, title), 
        instructions = COALESCE($2, instructions), 
        image_url = COALESCE($3, image_url)
      WHERE id = $4
    `;
    await client.query(updateQuery, [title, instructions, image_url, id]);

    if (ingredients && Array.isArray(ingredients)) {
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);
      
      const insertIngQuery = 'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, required_quantity) VALUES ($1, $2, $3)';
      for (const ing of ingredients) {
        await client.query(insertIngQuery, [id, ing.ingredient_id, ing.required_quantity]);
      }
    }

    await client.query('COMMIT'); 
    res.json({ message: '¡Receta actualizada con éxito!' });

  } catch (error) {
    await client.query('ROLLBACK'); 
    console.error('Error al editar la receta:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  } finally {
    client.release();
  }
};
export const deleteRecipe = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { user_id } = req.body; 

  if (!user_id) {
    res.status(400).json({ error: 'Debes proporcionar el user_id para verificar que eres el autor.' });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const checkAuth = await client.query('SELECT id FROM recipes WHERE id = $1 AND author_id = $2', [id, user_id]);
    
    if (checkAuth.rowCount === 0) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esta receta o no existe.' });
      await client.query('ROLLBACK');
      return;
    }
    await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);

    await client.query('DELETE FROM recipes WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ message: 'Receta eliminada por completo del sistema.' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar la receta:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud.' });
  } finally {
    client.release();
  }
};