const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();
require('./src/config/db'); 

const app = express();
const inventoryRoutes = require('./src/routes/inventoryRoutes');

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/inventory', inventoryRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});