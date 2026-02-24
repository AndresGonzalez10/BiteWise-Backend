const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

router.get('/', inventoryController.getInventory);
router.post("/", inventoryController.addInventoryItem); 

module.exports = router;