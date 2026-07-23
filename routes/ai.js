import express from 'express';
import { generateContent, getInteractionHistory } from '../controllers/aiController.js';

const router = express.Router();

// Endpoint para gerar conteúdo com Google AI
router.post('/generate', async (req, res) => {
  try {
    const { prompt, userId } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt é obrigatório'
      });
    }

    const result = await generateContent(prompt, userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para recuperar histórico de interações
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await getInteractionHistory(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
