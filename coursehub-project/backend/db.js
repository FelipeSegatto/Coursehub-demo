require("dotenv").config();

const mysql = require("mysql2");

function resolveDatabaseName() {
  if (process.env.NODE_ENV !== "test") {
    return process.env.DB_NAME;
  }

  const testName = process.env.DB_NAME_TEST;

  if (!testName) {
    throw new Error(
      "DB_NAME_TEST é obrigatório quando NODE_ENV=test. Recuse usar o banco de desenvolvimento."
    );
  }

  if (testName === "coursehub_escola") {
    throw new Error(
      "DB_NAME_TEST não pode ser coursehub_escola. Crie um schema isolado (ex.: coursehub_test)."
    );
  }

  return testName;
}

const databaseName = resolveDatabaseName();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.getConnection((error, connection) => {
  if (error) {
    console.log("Erro ao conectar no MySQL:", error.message);
    return;
  }

  console.log("Conectado ao MySQL!");
  connection.release();
});

module.exports = db;