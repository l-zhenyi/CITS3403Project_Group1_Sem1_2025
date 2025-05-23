"""empty message

Revision ID: 5f5e359109c8
Revises: 361607381e69
Create Date: 2025-05-11 14:43:44.611863

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5f5e359109c8'
down_revision = '361607381e69'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_cost_split', sa.Boolean(), nullable=False))
        batch_op.add_column(sa.Column('creator_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('allow_others_edit_title', sa.Boolean(), nullable=False))
        batch_op.add_column(sa.Column('allow_others_edit_details', sa.Boolean(), nullable=False))
        batch_op.create_foreign_key('fk_event_creator_id_user', 'user', ['creator_id'], ['id'])

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.drop_constraint('fk_event_creator_id_user', type_='foreignkey')
        batch_op.drop_column('allow_others_edit_details')
        batch_op.drop_column('allow_others_edit_title')
        batch_op.drop_column('creator_id')
        batch_op.drop_column('is_cost_split')

    # ### end Alembic commands ###
