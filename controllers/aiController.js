import model from '../config/ai.js';
import pool from '../config/db.js';

export async function generateContent(prompt, userId = null) {
  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Salvar na base de dados se userId for fornecido
    if (userId) {
      await pool.query(
        `INSERT INTO ai_interactions (user_id, prompt, response) 
         VALUES ($1, $2, $3)`,
        [userId, prompt, text]
      );
    }

    return {
      success: true,
      prompt,
      response: text,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Erro ao gerar conteúdo:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getInteractionHistory(userId) {
  try {
    const result = await pool.query(
      `SELECT id, prompt, response, created_at 
       FROM ai_interactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    return {
      success: true,
      interactions: result.rows
    };
  } catch (error) {
    console.error('Erro ao recuperar histórico:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
