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