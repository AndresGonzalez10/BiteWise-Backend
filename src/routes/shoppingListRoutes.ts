import { Router } from 'express';
import { generateListFromRecipe,getShoppingList,deleteShoppingList,updateShoppingList } from '../controllers/shoppingListController';
import { purchaseList } from '../controllers/shoppingListController';

const router = Router();

router.post('/generate', generateListFromRecipe);
router.get('/:list_id', getShoppingList);
router.post('/:id/purchase', purchaseList);
router.delete('/:id', deleteShoppingList);
router.put('/:id', updateShoppingList);

export default router;