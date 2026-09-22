/**
 * Atribui um avatar de catálogo (4 femininos + 4 masculinos) a cada
 * usuário sem foto enviada. Idempotente: só preenche avatar_key;
 * nunca toca em avatar_file_id.
 *
 * Uso: node database/seeds/20260918_005_seed_profile_avatars.cjs
 */
const db = require("../../coursehub-project/backend/db");
const { pickAvatarKeyForUser } = require("../../coursehub-project/backend/services/profile/avatarCatalog");

async function run() {
  const [users] = await db.promise().query(
    `SELECT id, gender, avatar_key, avatar_file_id FROM users`
  );

  let updated = 0;

  for (const user of users) {
    if (user.avatar_file_id) {
      continue;
    }

    const avatarKey = pickAvatarKeyForUser(user);

    if (user.avatar_key === avatarKey) {
      continue;
    }

    await db.promise().query(`UPDATE users SET avatar_key = ?, updated_at = NOW() WHERE id = ?`, [
      avatarKey,
      user.id,
    ]);
    updated += 1;
  }

  console.log(`Avatares atualizados: ${updated} de ${users.length} usuários.`);
  process.exit(0);
}

run().catch((error) => {
  console.error("Falha ao semear avatares:", error);
  process.exit(1);
});
