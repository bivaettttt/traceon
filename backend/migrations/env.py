from alembic import context
from traceon.store import db

with db.connect() as conn:
    context.configure(connection=conn)
    with context.begin_transaction():
        context.run_migrations()
