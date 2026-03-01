import { Router } from 'express';
import { generateListFromRecipe } from '../controllers/shoppingListController';

const router = Router();

// Ruta para generar lista a partir de receta
router.post('/generate', generateListFromRecipe);

export default router;