import pool from '../config/db.js';

export async function createUser(username, email) {
  try {
    const result = await pool.query(
      `INSERT INTO users (username, email) 
       VALUES ($1, $2) 
       RETURNING id, username, email, created_at`,
      [username, email]
    );
    return {
      success: true,
      user: result.rows[0]
    };
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getUser(userId) {
  try {
    const result = await pool.query(
      `SELECT id, username, email, created_at, updated_at 
       FROM users WHERE id = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return { success: false, error: 'Usuário não encontrado' };
    }
    return {
      success: true,
      user: result.rows[0]
    };
  } catch (error) {
    console.error('Erro ao recuperar usuário:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function saveContent(userId, contentType, content, metadata = {}) {
  try {
    const result = await pool.query(
      `INSERT INTO generated_content (user_id, content_type, content, metadata) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, user_id, content_type, created_at`,
      [userId, contentType, content, JSON.stringify(metadata)]
    );
    return {
      success: true,
      content: result.rows[0]
    };
  } catch (error) {
    console.error('Erro ao salvar conteúdo:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getUserContent(userId) {
  try {
    const result = await pool.query(
      `SELECT id, content_type, content, metadata, created_at 
       FROM generated_content 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    return {
      success: true,
      contents: result.rows
    };
  } catch (error) {
    console.error('Erro ao recuperar conteúdo:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
