import { Request, Response } from 'express';
import pool from '../config/db';

const THEMEALDB_BASE_URL = 'https://www.themealdb.com/api/json/v1/1';

// 🌎 1. FILTRO DE REGIONES
const ALLOWED_AREAS = ['Mexican', 'American', 'Canadian', 'Venezuelan', 'Argentinian'];

// 🚫 2. LISTA NEGRA DE INGREDIENTES
const FORBIDDEN_INGREDIENTS = [
  'saffron', 'truffle', 'goose', 'venison', 'caviar', 'kangaroo', 
  'ostrich', 'garam masala', 'five spice', 'curry powder'
];

// 🧠 3. DICCIONARIO INTELIGENTE (Gringo a Gramos)
const convertToGrams = (measure: string, ingredientName: string): number => {
  const lowerMeasure = measure.toLowerCase();
  
  // Extraemos el primer número (ej: "1 1/2 cups" sacará un aproximado)
  const match = lowerMeasure.match(/(\d+[\d\./]*)/); 
  const amount = match ? parseFloat(match[1]) : 1; 

  if (lowerMeasure.includes('kg')) return amount * 1000;
  if (lowerMeasure.includes('g') && !lowerMeasure.includes('garlic')) return amount;
  if (lowerMeasure.includes('lb')) return amount * 453; 
  if (lowerMeasure.includes('oz')) return amount * 28;  
  if (lowerMeasure.includes('quart')) return amount * 946; // 1 quart = ~946 ml
  if (lowerMeasure.includes('cup')) return amount * 240; 
  if (lowerMeasure.includes('tbsp') || lowerMeasure.includes('tablespoon') || lowerMeasure.includes('tbs')) return amount * 15; 
  if (lowerMeasure.includes('tsp') || lowerMeasure.includes('teaspoon')) return amount * 5; 
  if (lowerMeasure.includes('clove')) return amount * 5; 
  if (lowerMeasure.includes('large') || lowerMeasure.includes('whole')) return amount * 150; 

  return amount * 50; // Si no entendemos la medida, 50g por defecto
};

// 🕵️‍♀️ 4. FUNCIÓN PARA DETECTAR INGREDIENTES PROHIBIDOS
const hasForbiddenIngredients = (meal: any): boolean => {
  for (let i = 1; i <= 20; i++) {
    const ingredient = meal[`strIngredient${i}`];
    if (ingredient) {
      if (FORBIDDEN_INGREDIENTS.some(forbidden => ingredient.toLowerCase().includes(forbidden))) {
        return true; 
      }
    }
  }
  return false; 
};

// 🧹 5. LIMPIADOR DE FORMATO (Adiós a los 20 campos)
const formatRecipe = (meal: any) => {
  const ingredients = [];

  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];

    if (name && name.trim() !== '') {
      ingredients.push({
        name: name.trim(),
        original_measure: measure ? measure.trim() : '',
        estimated_grams: convertToGrams(measure || '', name)
      });
    }
  }

  return {
    external_id: meal.idMeal,
    title: meal.strMeal,
    category: meal.strCategory,
    area: meal.strArea,
    image_url: meal.strMealThumb,
    instructions: meal.strInstructions,
    ingredients: ingredients
  };
};

// 🌉 6. EL CONTROLADOR PRINCIPAL
export const searchExternalRecipes = async (req: Request, res: Response): Promise<void> => {
  const { query } = req.query; 

  if (!query) {
    res.status(400).json({ error: 'Debes proporcionar un término de búsqueda. Ejemplo: ?query=chicken' });
    return;
  }

  try {
    const response = await fetch(`${THEMEALDB_BASE_URL}/search.php?s=${query}`);
    const data = await response.json();

    if (!data.meals) {
      res.status(404).json({ message: 'No se encontraron recetas con ese término.' });
      return;
    }

    // PASO A: Filtramos por región
    let filteredMeals = data.meals.filter((meal: any) => ALLOWED_AREAS.includes(meal.strArea));

    // PASO B: Filtramos ingredientes prohibidos
    filteredMeals = filteredMeals.filter((meal: any) => !hasForbiddenIngredients(meal));

    if (filteredMeals.length === 0) {
      res.status(404).json({ 
        message: 'Las recetas encontradas contenían ingredientes muy difíciles de conseguir o no son de la región permitida.' 
      });
      return;
    }

    // PASO C: Traducimos a Gramos y Limpiamos el JSON
    const finalRecipes = filteredMeals.map((meal: any) => formatRecipe(meal));

    res.json({
      message: 'Recetas listas para BiteWise',
      total_results: finalRecipes.length,
      recipes: finalRecipes
    });

  } catch (error) {
    console.error('Error al consultar TheMealDB:', error);
    res.status(500).json({ error: 'Error al conectar con la API externa' });
  }
};

export const importExternalRecipe = async (req: Request, res: Response): Promise<void> => {
  const { title, instructions, image_url, ingredients } = req.body;

  if (!title || !instructions || !ingredients || !Array.isArray(ingredients)) {
    res.status(400).json({ error: 'El formato de la receta es incorrecto o faltan datos.' });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN'); 


    const recipeQuery = `
      INSERT INTO recipes (title, instructions, image_url) 
      VALUES ($1, $2, $3) RETURNING id
    `;
    const recipeResult = await client.query(recipeQuery, [title, instructions, image_url]);
    const newRecipeId = recipeResult.rows[0].id;

    for (const ing of ingredients) {
      const { name, estimated_grams } = ing;
      let ingredientId;
      const checkIng = await client.query('SELECT id FROM ingredients WHERE LOWER(name) = LOWER($1)', [name]);

      if (checkIng.rowCount && checkIng.rowCount > 0) {
        ingredientId = checkIng.rows[0].id;
      } else {
        const insertIng = await client.query(`
          INSERT INTO ingredients (name, category, unit_price, unit_default) 
          VALUES ($1, 'Importado', 0.0500, 'g') RETURNING id
        `, [name]);
        ingredientId = insertIng.rows[0].id;
      }

      await client.query(`
        INSERT INTO recipe_ingredients (recipe_id, ingredient_id, required_quantity) 
        VALUES ($1, $2, $3)
      `, [newRecipeId, ingredientId, estimated_grams]);
    }

    await client.query('COMMIT'); 
    res.status(201).json({
      message: '¡Receta importada exitosamente a tu base de datos local!',
      local_recipe_id: newRecipeId
    });

  } catch (error) {
    await client.query('ROLLBACK'); 
    console.error('Error al importar la receta:', error);
    res.status(500).json({ error: 'Hubo un error al guardar la receta en la base de datos' });
  } finally {
    client.release(); 
  }
};