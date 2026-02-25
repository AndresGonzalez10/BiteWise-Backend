import { Router } from 'express';
import { getAllRecipes } from '../controllers/recipeController';

const router = Router();
router.get('/', getAllRecipes);

export default router;