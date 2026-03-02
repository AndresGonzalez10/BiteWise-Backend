import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_por_defecto';
export interface AuthRequest extends Request {
  user?: any;
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    res.status(401).json({ error: 'Acceso denegado. No hay token proporcionado.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; 
    next(); 
  } catch (error) {
    res.status(403).json({ error: 'Token inválido o expirado. Inicia sesión de nuevo.' });
  }
};
export const isAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'administrador') {
    res.status(403).json({ error: 'Acceso denegado. Esta acción requiere privilegios de Administrador.' });
    return;
  }
  next(); 
};