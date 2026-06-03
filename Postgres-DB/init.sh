#!/bin/bash
# Creates separate databases + users for Keycloak and CBS inside the same Postgres
# instance. Runs once on first container start (postgres init scripts are idempotent
# by design — both blocks use IF NOT EXISTS / \gexec).
set -e

KC_DB_PASS="${KC_DB_PASSWORD:-keycloak_dev_password}"
CBS_DB_PASS="${CBS_DB_PASSWORD:-cbs_dev_password}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak_user') THEN
            CREATE USER keycloak_user WITH PASSWORD '$KC_DB_PASS';
        END IF;
    END
    \$\$;

    SELECT 'CREATE DATABASE keycloak_db OWNER keycloak_user'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak_db')\gexec

    GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak_user;

    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cbs_user') THEN
            CREATE USER cbs_user WITH PASSWORD '$CBS_DB_PASS';
        END IF;
    END
    \$\$;

    SELECT 'CREATE DATABASE cbs_db OWNER cbs_user'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cbs_db')\gexec

    GRANT ALL PRIVILEGES ON DATABASE cbs_db TO cbs_user;
EOSQL
