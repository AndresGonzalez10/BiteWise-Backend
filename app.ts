import express, { Application } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import inventoryRoutes from './src/routes/inventoryRoutes';
import recipeRoutes from './src/routes/recipeRoutes';
import shoppingListRoutes from './src/routes/shoppingListRoutes';
import userRoutes from './src/routes/userRoutes';
import { initializeAdmin } from './src/utils/initAdmin';
import './src/config/db'; 

dotenv.config();

const app: Application = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/inventory', inventoryRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/shopping-lists', shoppingListRoutes);
app.use('/api/users', userRoutes);


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
  initializeAdmin();
});