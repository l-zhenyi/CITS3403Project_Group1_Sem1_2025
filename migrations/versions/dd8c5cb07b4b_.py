"""empty message

Revision ID: dd8c5cb07b4b
Revises: feb28c0f875e
Create Date: 2025-05-09 16:27:15.884677

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'dd8c5cb07b4b'
down_revision = 'feb28c0f875e'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('location_coordinates', sa.String(length=120), nullable=True))

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.drop_column('location_coordinates')

    # ### end Alembic commands ###
