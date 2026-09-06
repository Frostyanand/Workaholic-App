-- Up Migration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Down Migration
DROP EXTENSION IF EXISTS "btree_gist";
DROP EXTENSION IF EXISTS "uuid-ossp";
