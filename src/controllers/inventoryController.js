const pool = require('../config/db');

const getInventory = async (req, res) => {
  try {
    const query = `SELECT * FROM ingredients`;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener los ingredientes:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

const addInventoryItem = async (req, res) => {
  const { user_id, ingredient_id, current_quantity } = req.body;
  try {
    const query = `
      INSERT INTO inventory (user_id, ingredient_id, current_quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, ingredient_id) 
      DO UPDATE SET current_quantity = inventory.current_quantity + $3, updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const result = await pool.query(query, [user_id, ingredient_id, current_quantity]);
    res.status(201).json({
      message: 'Ingrediente añadido al inventario',
      item: result.rows[0]
    });
  } catch (error) {
    console.error('Error al añadir al inventario:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  }
};

module.exports = {
  getInventory,
  addInventoryItem
};