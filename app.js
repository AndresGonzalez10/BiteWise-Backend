const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();
require('./db.js');

const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.get('/', (req, res) => {
  res.send('Bitewise API is running... 🚀');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});