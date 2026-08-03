ALTER TABLE "AuditLog"
ADD COLUMN "sequence" BIGSERIAL NOT NULL,
ADD COLUMN "actorUserId" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "sessionHash" TEXT,
ADD COLUMN "reason" TEXT,
ADD COLUMN "previousHash" TEXT,
ADD COLUMN "integrityHash" TEXT;

CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");
CREATE UNIQUE INDEX "AuditLog_sequence_key" ON "AuditLog"("sequence");
CREATE UNIQUE INDEX "AuditLog_integrityHash_key" ON "AuditLog"("integrityHash");

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  IF current_setting('app.audit_retention', true) IS DISTINCT FROM 'enabled' THEN
    RAISE EXCEPTION 'AuditLog is append-only; use the controlled retention job';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
