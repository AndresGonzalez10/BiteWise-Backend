import { Router } from 'express';
import { createIngredient, updateIngredient } from '../controllers/ingredientController';

const router = Router();

router.post('/', createIngredient);
router.put('/:id', updateIngredient);

export default router;