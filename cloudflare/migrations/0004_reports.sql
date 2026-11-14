CREATE TABLE reports(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,title TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX reports_one_draft ON reports(owner) WHERE archived=0;
CREATE INDEX reports_history ON reports(owner,archived,updated);
