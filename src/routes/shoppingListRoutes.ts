import { Router } from 'express';
import { generateListFromRecipe,getShoppingList } from '../controllers/shoppingListController';
import { purchaseList } from '../controllers/shoppingListController';

const router = Router();

router.post('/generate', generateListFromRecipe);
router.get('/:list_id', getShoppingList);
router.post('/:id/purchase', purchaseList);

export default router;