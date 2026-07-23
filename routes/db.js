import express from 'express';
import { 
  createUser, 
  getUser, 
  saveContent, 
  getUserContent 
} from '../controllers/dbController.js';

const router = express.Router();

// Criar novo usuário
router.post('/users', async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username || !email) {
      return res.status(400).json({
        success: false,
        error: 'Username e email são obrigatórios'
      });
    }

    const result = await createUser(username, email);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Recuperar usuário
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await getUser(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Salvar conteúdo
router.post('/content', async (req, res) => {
  try {
    const { userId, contentType, content, metadata } = req.body;

    if (!userId || !contentType || !content) {
      return res.status(400).json({
        success: false,
        error: 'userId, contentType e content são obrigatórios'
      });
    }

    const result = await saveContent(userId, contentType, content, metadata);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Recuperar conteúdo do usuário
router.get('/content/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await getUserContent(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
