const pool = require('../config/db');
const getInventory = async (req, res) => {
  try {
    const userId = req.query.userId; 

    const query = `
       eloquence
      SELECT i.id, ing.name, i.current_quantity, ing.unit_default 
      FROM inventory i
      JOIN ingredients ing ON i.ingredient_id = ing.id
      WHERE i.user_id = $1
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener el inventario:', error);
    res.status(500).json({ error: 'Error al obtener los datos del servidor' });
  }
};

module.exports = {
  getInventory
};