/**
 * Migração única: cria as tabelas de apoio ao sistema de autenticação
 * (refresh tokens e tokens de recuperação de senha).
 *
 * Uso: node migrations/001_create_auth_tokens_tables.js
 */
require("dotenv").config();

const db = require("../db");

const statements = [
  `
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      replaced_by_token_hash CHAR(64) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_refresh_tokens_hash (token_hash),
      KEY idx_refresh_tokens_user (user_id),
      CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_password_reset_tokens_hash (token_hash),
      KEY idx_password_reset_tokens_user (user_id),
      CONSTRAINT fk_password_reset_tokens_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
];

async function run() {
  const connection = db.promise();

  for (const statement of statements) {
    await connection.query(statement);
  }

  console.log("Migração concluída: refresh_tokens e password_reset_tokens prontas.");
  process.exit(0);
}

run().catch((error) => {
  console.error("Erro ao rodar a migração:", error);
  process.exit(1);
});
