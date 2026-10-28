"""Initial backend storage, transactional outbox and append-only evidence."""
from alembic import op
from services.common.store import DDL
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    for statement in DDL.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'BIGSERIAL PRIMARY KEY').split(';'):
        if statement.strip():
            op.execute(statement)
    op.execute('''CREATE FUNCTION prevent_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Evidence is append-only'; END; $$''')
    op.execute('''CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON evidence
                  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_mutation()''')

def downgrade():
    raise RuntimeError('Destructive rollback of evidence is prohibited; restore an approved database backup')
