import { Router } from 'express';
import { getInventory, addInventoryItem } from '../controllers/inventoryController';

const router = Router();

router.get('/:user_id', getInventory);
router.post('/', addInventoryItem);

export default router;