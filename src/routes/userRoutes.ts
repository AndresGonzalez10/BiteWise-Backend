import { Router, Response } from 'express';
import { registerUser, loginUser,getAdminStats } from '../controllers/userController';
import { verifyToken, isAdmin, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/estadisticas', verifyToken, isAdmin, getAdminStats);

router.get('/estadisticas', verifyToken, isAdmin, (req: AuthRequest, res: Response) => {
  res.json({
    message: '¡Bienvenido a la bóveda secreta, Administrador!',
    admin_data: req.user,
    stats: {
      total_usuarios: 150,
      recetas_cocinadas: 342
    }
  });
});
export default router;