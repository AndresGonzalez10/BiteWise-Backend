import { Router } from 'express';
import { getAllRecipes,createRecipe,getMatchingRecipes } from '../controllers/recipeController';

const router = Router();
router.get('/', getAllRecipes);
router.post('/', createRecipe);
router.get('/match/:user_id', getMatchingRecipes);

export default router;
