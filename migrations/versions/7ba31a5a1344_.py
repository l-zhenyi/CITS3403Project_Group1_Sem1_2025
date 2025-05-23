"""#2

Revision ID: 7ba31a5a1344
Revises: 4d27a5cbf23f
Create Date: 2025-05-04 19:25:25.732332

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7ba31a5a1344'
down_revision = '4d27a5cbf23f'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('insight_panel',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('analysis_type', sa.String(length=80), nullable=False),
    sa.Column('title', sa.String(length=150), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('display_order', sa.Integer(), nullable=False),
    sa.Column('configuration', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('insight_panel', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_insight_panel_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('event_rsvp', schema=None) as batch_op:
        batch_op.create_unique_constraint('_user_event_uc', ['user_id', 'event_id'])

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cost_value', sa.Float(), nullable=True))
        batch_op.alter_column('description',
               existing_type=sa.VARCHAR(length=240),
               nullable=True)

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.alter_column('description',
               existing_type=sa.VARCHAR(length=240),
               nullable=False)
        batch_op.drop_column('cost_value')

    with op.batch_alter_table('event_rsvp', schema=None) as batch_op:
        batch_op.drop_constraint('_user_event_uc', type_='unique')

    with op.batch_alter_table('insight_panel', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_insight_panel_user_id'))

    op.drop_table('insight_panel')
    # ### end Alembic commands ###
