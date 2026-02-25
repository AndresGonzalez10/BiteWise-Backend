import { Router } from 'express';
import { getAllRecipes,createRecipe } from '../controllers/recipeController';

const router = Router();
router.get('/', getAllRecipes);
router.post('/', createRecipe);

export default router;
