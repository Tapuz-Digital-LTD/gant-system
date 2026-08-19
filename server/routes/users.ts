import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { UserAccess, UserRole } from '../../src/types.js';

export const usersRouter = Router();

// GET all users
usersRouter.get('/', (req: Request, res: Response) => {
  try {
    const users = storage.getUsers();
    res.json({ success: true, count: users.length, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// POST add new user
usersRouter.post('/', (req: Request, res: Response) => {
  try {
    const { email, name, role, avatarBg } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'User email is required' });
    }

    const existing = storage.getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ success: false, message: 'User with this email already exists' });
    }

    const avatarColors = ['#F7414B', '#5059FF', '#2FA36B', '#FF732D', '#9A9291', '#3A3534'];
    const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const newUser: UserAccess = {
      id: `user-${Date.now()}`,
      email: email.trim().toLowerCase(),
      name: name?.trim() || email.split('@')[0],
      role: (role as UserRole) || 'editor',
      avatarBg: avatarBg || randomColor,
      addedAt: new Date().toISOString().slice(0, 10),
      accessibleBoards: ['all']
    };

    const created = storage.addUser(newUser);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// PUT update user
usersRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const updated = storage.updateUser(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});

// DELETE user
usersRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const success = storage.deleteUser(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User access removed successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
  }
});
