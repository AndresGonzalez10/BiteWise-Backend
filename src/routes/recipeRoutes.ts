import { Router } from 'express';
import { getAllRecipes,createRecipe,getMatchingRecipes,cookRecipe } from '../controllers/recipeController';

const router = Router();
router.get('/', getAllRecipes);
router.post('/', createRecipe);
router.get('/match/:user_id', getMatchingRecipes);
router.post('/cook', cookRecipe);

export default router;
