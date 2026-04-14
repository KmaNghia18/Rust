-- Postgres initialization script (runs on first start)

-- Create separate DB for each service boundary
CREATE DATABASE discord_auth;
CREATE DATABASE discord_guilds;
CREATE DATABASE discord_notifications;

-- Create application user (read/write only, no superuser)
CREATE USER discord_app WITH PASSWORD 'app_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE discord_dev          TO discord_app;
GRANT ALL PRIVILEGES ON DATABASE discord_auth         TO discord_app;
GRANT ALL PRIVILEGES ON DATABASE discord_guilds       TO discord_app;
GRANT ALL PRIVILEGES ON DATABASE discord_notifications TO discord_app;

-- Enable extensions
\c discord_dev
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c discord_auth
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c discord_guilds
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c discord_notifications
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
