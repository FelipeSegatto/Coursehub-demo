const bcrypt = require("bcryptjs");
const db = require("../../../backend/db");

async function migratePasswords() {
  const [users] = await db.promise().query(
    "SELECT id, password_hash FROM users"
  );

  for (const user of users) {
    if (!user.password_hash.startsWith("$2")) {
      const hash = await bcrypt.hash(user.password_hash, 10);

      await db.promise().query(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        [hash, user.id]
      );

      console.log(`Usuário ${user.id} atualizado.`);
    }
  }

  console.log("Migração concluída.");
  process.exit();
}

migratePasswords();