import { Router } from 'express';
import { searchExternalRecipes,importExternalRecipe } from '../controllers/externalRecipeController';

const router = Router();
router.get('/search', searchExternalRecipes);
router.post('/import', importExternalRecipe);

export default router;