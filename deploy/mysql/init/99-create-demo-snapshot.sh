#!/bin/bash

set -e

echo "========================================"
echo "Criando banco snapshot da demo..."
echo "========================================"

mysql \
  --protocol=socket \
  -uroot \
  -p"${MYSQL_ROOT_PASSWORD}" <<EOSQL

CREATE DATABASE IF NOT EXISTS coursehub_escola_jornada
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

GRANT SELECT
ON coursehub_escola_jornada.*
TO '${MYSQL_USER}'@'%';

FLUSH PRIVILEGES;

EOSQL

echo "Copiando CourseHub para snapshot..."

mysqldump \
  --protocol=socket \
  -uroot \
  -p"${MYSQL_ROOT_PASSWORD}" \
  --single-transaction \
  --skip-lock-tables \
  --routines \
  --triggers \
  coursehub_escola \
  | mysql \
      --protocol=socket \
      -uroot \
      -p"${MYSQL_ROOT_PASSWORD}" \
      coursehub_escola_jornada

echo "========================================"
echo "Snapshot criado com sucesso."
echo "========================================"