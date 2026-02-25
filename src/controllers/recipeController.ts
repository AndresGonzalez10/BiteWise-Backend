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