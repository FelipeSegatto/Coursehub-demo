mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<EOSQL
CREATE DATABASE IF NOT EXISTS coursehub_escola_jornada
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

GRANT SELECT ON coursehub_escola_jornada.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
EOSQL
