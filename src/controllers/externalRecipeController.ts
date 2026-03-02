import { Request, Response } from 'express';
import pool from '../config/db';
interface ExternalMeal {
  idMeal: string;
  strMeal: string;
  strCategory: string;
  strArea: string;
  strMealThumb: string;
  strInstructions: string;
  [key: string]: string | null; 
}

const THEMEALDB_BASE_URL = 'https://www.themealdb.com/api/json/v1';

const ALLOWED_AREAS = ['Mexican', 'American', 'Canadian', 'Venezuelan', 'Argentinian'];
const FORBIDDEN_INGREDIENTS = [
  'saffron', 'truffle', 'goose', 'venison', 'caviar', 'kangaroo', 
  'ostrich', 'garam masala', 'five spice', 'curry powder'
];

const convertToGrams = (measure: string, ingredientName: string): number => {
  const lowerMeasure = measure.toLowerCase();
  const match = lowerMeasure.match(/(\d+[\d\./]*)/); 
  const amount = match ? parseFloat(match[1]) : 1; 

  if (lowerMeasure.includes('kg')) return amount * 1000;
  if (lowerMeasure.includes('g') && !lowerMeasure.includes('garlic')) return amount;
  if (lowerMeasure.includes('lb')) return amount * 453; 
  if (lowerMeasure.includes('oz')) return amount * 28;  
  if (lowerMeasure.includes('quart')) return amount * 946;
  if (lowerMeasure.includes('cup')) return amount * 240; 
  if (lowerMeasure.includes('tbsp') || lowerMeasure.includes('tablespoon') || lowerMeasure.includes('tbs')) return amount * 15; 
  if (lowerMeasure.includes('tsp') || lowerMeasure.includes('teaspoon')) return amount * 5; 
  if (lowerMeasure.includes('clove')) return amount * 5; 
  if (lowerMeasure.includes('large') || lowerMeasure.includes('whole')) return amount * 150; 

  return amount * 50; 
};

const hasForbiddenIngredients = (meal: ExternalMeal): boolean => {
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

const formatRecipe = (meal: ExternalMeal) => {
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

export const searchExternalRecipes = async (req: Request, res: Response): Promise<void> => {
  const { query } = req.query; 

  if (!query) {
    res.status(400).json({ code: "QUERY_REQUIRED", message: 'Debes proporcionar un término de búsqueda.' });
    return;
  }

  const apiKey = process.env.THEMEALDB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ 
      code: "MISSING_API_KEY", 
      message: "Configura THEMEALDB_API_KEY en tu archivo .env" 
    });
    return;
  }

  try {
    const url = `${THEMEALDB_BASE_URL}/${apiKey}/search.php?s=${encodeURIComponent(query as string)}`;
    const response = await fetch(url);
    
    if (response.status === 401) {
      res.status(502).json({ code: "PROVIDER_UNAUTHORIZED", message: "API Key inválida o expirada" });
      return;
    }
    if (response.status === 429) {
      res.status(503).json({ code: "PROVIDER_RATE_LIMIT", message: "Límite de requests alcanzado." });
      return;
    }
    if (!response.ok) {
      res.status(502).json({ code: "PROVIDER_ERROR", message: "Proveedor respondió con error" });
      return;
    }

    const data = await response.json();

    if (!data.meals) {
      res.status(404).json({ message: 'No se encontraron recetas con ese término.' });
      return;
    }

    let filteredMeals = data.meals.filter((meal: ExternalMeal) => ALLOWED_AREAS.includes(meal.strArea));
    filteredMeals = filteredMeals.filter((meal: ExternalMeal) => !hasForbiddenIngredients(meal));

    if (filteredMeals.length === 0) {
      res.status(404).json({ message: 'Las recetas encontradas contenían ingredientes difíciles o no son de la región permitida.' });
      return;
    }

    const finalRecipes = filteredMeals.map((meal: ExternalMeal) => formatRecipe(meal));

    res.json({
      message: 'Recetas listas para BiteWise',
      total_results: finalRecipes.length,
      recipes: finalRecipes
    });

  } catch (error) {
    console.error('Error al consultar TheMealDB:', error);
    res.status(502).json({ code: "NETWORK_ERROR", message: "No se pudo contactar al proveedor" });
  }
};

export const importExternalRecipe = async (req: Request, res: Response): Promise<void> => {
};