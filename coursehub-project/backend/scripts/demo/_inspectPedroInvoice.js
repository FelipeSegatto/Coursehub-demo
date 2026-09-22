require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [cols] = await conn.query(`SHOW COLUMNS FROM payments WHERE Field IN ('pix_qr_code', 'pix_copy_paste', 'pix_expires_at')`);
  const [sample] = await conn.query(
    `SELECT id, status, CHAR_LENGTH(pix_qr_code) AS qr_len, CHAR_LENGTH(pix_copy_paste) AS copy_len
     FROM payments WHERE invoice_id = 5800 ORDER BY id DESC LIMIT 5`
  );
  console.log("COLS", cols);
  console.log("SAMPLE", sample);
  await conn.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
