import { Router } from 'express';
import { getInventory, addInventoryItem } from '../controllers/inventoryController';

const router = Router();

router.get('/', getInventory);
router.post('/', addInventoryItem);

export default router;