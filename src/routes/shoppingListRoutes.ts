import { Router } from 'express';
import { generateListFromRecipe,getShoppingList } from '../controllers/shoppingListController';

const router = Router();

router.post('/generate', generateListFromRecipe);
router.get('/:list_id', getShoppingList);

export default router;