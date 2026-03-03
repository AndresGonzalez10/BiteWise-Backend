import { Router } from 'express';
import { getAllRecipes,createRecipe,getMatchingRecipes,cookRecipe, updateRecipe, deleteRecipe } from '../controllers/recipeController';

const router = Router();
router.get('/', getAllRecipes);
router.post('/', createRecipe);
router.get('/match/:user_id', getMatchingRecipes);
router.post('/cook', cookRecipe);
router.put('/:id', updateRecipe);
router.delete('/:id', deleteRecipe);

export default router;
