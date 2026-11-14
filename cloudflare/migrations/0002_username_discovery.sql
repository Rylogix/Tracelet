CREATE TABLE IF NOT EXISTS provider_cache(owner TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,provider TEXT NOT NULL,query TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(owner,provider,query));
CREATE INDEX IF NOT EXISTS provider_cache_expiry ON provider_cache(expires);
