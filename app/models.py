# --- START OF FILE app/models.py ---

from app import db, login
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin, current_user
from hashlib import md5
from datetime import datetime, timezone
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, DateTime, ForeignKey, Float, text, Text # Added Text type
from typing import Annotated, Optional, List
from flask import url_for # +++ IMPORT url_for

friends = db.Table(
    'friends',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id')),
    db.Column('friend_id', db.Integer, db.ForeignKey('user.id'))
)
class FriendRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    sender = db.relationship('User', foreign_keys=[sender_id], backref='sent_requests')
    receiver = db.relationship('User', foreign_keys=[receiver_id], backref='received_requests')
class User(UserMixin, db.Model):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    email: Mapped[str] = mapped_column(String(120), index=True, unique=True)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    about_me: Mapped[str] = mapped_column(String(140), nullable=True)
    last_active: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc), nullable=True)

    # Existing relationships
    groups: Mapped[list["GroupMember"]] = relationship("GroupMember", back_populates="user", lazy="dynamic")
    rsvps: Mapped[list["EventRSVP"]] = relationship("EventRSVP", back_populates="user")
    posts: Mapped[list["Post"]] = relationship("Post", back_populates="author", lazy="dynamic")

    messages_sent: Mapped[List["Message"]] = relationship("Message", foreign_keys="[Message.sender_id]", back_populates="sender")
    messages_received: Mapped[List["Message"]] = relationship("Message", foreign_keys="[Message.recipient_id]", back_populates="recipient")
    last_message_read_time: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    insight_panels: Mapped[list["InsightPanel"]] = relationship("InsightPanel", back_populates="user", lazy="dynamic")


    # New friends relationship
    friends: Mapped[List["User"]] = relationship(
        "User",
        secondary=friends,
        primaryjoin=(friends.c.user_id == id),
        secondaryjoin=(friends.c.friend_id == id),
        backref="friend_of",
        lazy="dynamic"
    )
    def __repr__(self) -> str:
        return f"<User {self.username}>"

    def avatar(self, size):
        digest = md5(self.email.lower().encode('utf-8')).hexdigest()
        return 'https://www.gravatar.com/avatar/{}?d=identicon&s={}'.format(
            digest, size)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def follow(self, user):
        if not self.is_following(user):
            self.followed.append(user)

    def unfollow(self, user):
        if self.is_following(user):
            self.followed.remove(user)


    def group_posts(self, group_id: int):
        return Post.query.join(GroupMember).filter(
            GroupMember.user_id == self.id,
            GroupMember.group_id == group_id,
            Post.user_id == self.id,
            Post.group_id == group_id
        ).order_by(Post.timestamp.desc())

    def new_messages(self):
        last_read_time = self.last_message_read_time or datetime(1900, 1, 1)
        return Message.query.filter_by(recipient=self).filter(
        Message.timestamp > last_read_time).count()

    def search_users_by_username(search_term):
    # Case insensitive search for usernames that match the search_term
        return User.query.filter(User.username.ilike(f'%{search_term}%')).all()

    def add_friend(self, user):
        """Add a user as a friend (bidirectional relationship)"""
        if not self.is_friend(user):
            # Add the target user to this user's friends
            self.friends.append(user)
            
            # Also add this user to the target user's friends (bidirectional)
            # Check to prevent duplicates if the relationship is already being added from the other side
            if not user.is_friend(self):
                user.friends.append(self)
    
    def remove_friend(self, user):
        """Remove a user from friends (bidirectional removal)"""
        if self.is_friend(user):
            # Remove the relationship from both sides
            self.friends.remove(user)
            
            # Also remove the relationship from the other user's side
            if user.is_friend(self):
                user.friends.remove(self)
            
    def is_friend(self, user):
        """Check if this user is friends with another user"""
        return user in self.friends.all()
    
    def is_member(self, group_id):
        """Check if user is a member of the specified group"""
        return db.session.scalar(db.select(GroupMember).filter_by(
            user_id=self.id, group_id=group_id)) is not None
    
    

class Post(db.Model):
    __tablename__ = "post"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    body: Mapped[str] = mapped_column(String(140))
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, default=datetime.now(timezone.utc))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey('user.id'))
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("groups.id"), nullable=True)
    group: Mapped[Optional["Group"]] = relationship(back_populates="posts")


    # Relationship to User
    author: Mapped["User"] = relationship("User", back_populates="posts")

    def __repr__(self):
        return f"<Post {self.body}>"

@login.user_loader
def load_user(id: str) -> Optional[User]:
    return db.session.get(User, int(id))

class Group(db.Model):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    avatar_url: Mapped[str] = mapped_column(String(255), nullable=True)
    about: Mapped[str] = mapped_column(String(255), nullable=True) # This is your description field

    members: Mapped[List["GroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", lazy="joined" # Added lazy="joined" for auto-load
    )

    posts: Mapped[List["Post"]] = relationship(
    back_populates="group", cascade="all, delete-orphan"
    )

    nodes: Mapped[List["Node"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )

    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id"), nullable=True)
    owner: Mapped[Optional["User"]] = relationship("User", foreign_keys=[owner_id])

    # --- NEW PERMISSION FIELDS ---
    allow_member_edit_name: Mapped[bool] = mapped_column(default=False, nullable=False)
    allow_member_edit_description: Mapped[bool] = mapped_column(default=False, nullable=False)
    allow_member_manage_members: Mapped[bool] = mapped_column(default=False, nullable=False)
    # --- END NEW PERMISSION FIELDS ---

    @property
    def avatar(self, size=128): # This property should likely just return self.avatar_url or default
        return self.avatar_url if self.avatar_url else f'https://www.gravatar.com/avatar/{md5(str(self.id).lower().encode("utf-8")).hexdigest()}?d=identicon&s={size}'


    def to_dict(self, include_nodes=True, include_members=False, current_user_id_param=None):
        data = {
            "id": self.id,
            "name": self.name,
            "avatar_url": self.avatar_url or url_for('static', filename='img/default-group-avatar.png'),
            "description": self.about,
            "owner_id": self.owner_id,
            # --- INCLUDE NEW PERMISSIONS ---
            "allow_member_edit_name": self.allow_member_edit_name,
            "allow_member_edit_description": self.allow_member_edit_description,
            "allow_member_manage_members": self.allow_member_manage_members,
            "is_current_user_owner": False # Default
        }
        if current_user_id_param is not None and self.owner_id == current_user_id_param:
            data["is_current_user_owner"] = True
        # --- END INCLUDE NEW PERMISSIONS ---

        if include_nodes:
            data["nodes"] = [node.to_dict(include_events=False) for node in self.nodes]

        if include_members:
            data['members'] = []
            members_list = self.members if not hasattr(self.members, 'all') else self.members.all()
            for member_assoc in members_list:
                member_user = member_assoc.user
                if member_user:
                    # Use the is_current_user_owner determined above for the group owner,
                    # then check member_assoc.is_owner for individual member ownership (though this is less common if group has one owner)
                    is_owner_flag = (self.owner_id == member_user.id) if self.owner_id else False
                    data['members'].append({
                        'user_id': member_user.id,
                        'username': member_user.username,
                        'avatar_url': member_user.avatar(40),
                        'is_owner': is_owner_flag # This reflects if THIS member is THE group owner
                    })
        return data

class Node(db.Model):
    __tablename__ = "nodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(100))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    group: Mapped["Group"] = relationship(back_populates="nodes")

    events: Mapped[List["Event"]] = relationship(
        back_populates="node", cascade="all, delete-orphan"
    )

    def to_dict(self, include_events: bool = False, current_user_id=None): # Added current_user_id
        data = {
            "id": self.id,
            "label": self.label,
            "x": self.x,
            "y": self.y,
            "group_id": self.group_id,
        }

        if include_events:
            # Pass current_user_id to event.to_dict if it needs it
            data["events"] = [event.to_dict(current_user_id=current_user_id) for event in self.events]

        return data


class Event(db.Model):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    location: Mapped[str] = mapped_column(String(120))
    location_coordinates: Mapped[str] = mapped_column(String(120), nullable=True) # e.g., "lat,lng"
    description: Mapped[str] = mapped_column(String(240), nullable=True)
    image_url: Mapped[str] = mapped_column(String(255), nullable=True)
    cost_display: Mapped[str] = mapped_column(String(50), nullable=True) # User-facing display string
    cost_value: Mapped[Optional[Float]] = mapped_column(Float, nullable=True) # Actual numeric cost for calculations
    is_cost_split: Mapped[bool] = mapped_column(default=False, nullable=False) # NEW for cost splitting
    
    # Provide explicit names for ForeignKey constraints to aid Alembic, especially in batch mode
    node_id: Mapped[Optional[int]] = mapped_column(ForeignKey("nodes.id", name="fk_event_node_id_nodes"), nullable=True)
    creator_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.id", name="fk_event_creator_id_user"), nullable=True) # Store who created event
    
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[creator_id])

    # Event-specific edit permissions (for non-creator/non-group-owner members if allowed)
    allow_others_edit_title: Mapped[bool] = mapped_column(default=False, nullable=False)
    allow_others_edit_details: Mapped[bool] = mapped_column(default=False, nullable=False) # Covers desc, loc, date, cost

    # Relationships
    node: Mapped[Optional["Node"]] = relationship("Node", back_populates="events") # Optional if node_id can be null

    attendees: Mapped[List["EventRSVP"]] = relationship("EventRSVP", back_populates="event", cascade="all, delete-orphan")
    guests: Mapped[List["InvitedGuest"]] = relationship("InvitedGuest", back_populates="event")

    def to_dict(self, current_user_id=None):
        data = {
            "id": self.id,
            "title": self.title,
            "date": self.date.isoformat().replace('+00:00', 'Z') if self.date and isinstance(self.date, datetime) else None,
            "location": self.location,
            "location_coordinates": self.location_coordinates,
            "description": self.description,
            "image_url": self.image_url,
            "cost_display": self.cost_display,
            "cost_value": self.cost_value,
            "is_cost_split": self.is_cost_split, # NEW
            "node_id": self.node_id,
            "creator_id": self.creator_id, # NEW
            "allow_others_edit_title": self.allow_others_edit_title, # NEW
            "allow_others_edit_details": self.allow_others_edit_details, # NEW
            "current_user_rsvp_status": None,
            "group_id": None,
            "group_name": None,
            "is_current_user_creator": False, # NEW
            "is_current_user_group_owner": False # NEW
        }

        if current_user_id is not None:
            my_rsvp = db.session.execute(
                db.select(EventRSVP).filter_by(event_id=self.id, user_id=current_user_id)
            ).scalar_one_or_none()
            if my_rsvp:
                data['current_user_rsvp_status'] = my_rsvp.status
            if self.creator_id == current_user_id:
                data['is_current_user_creator'] = True

        if self.node and self.node.group:
            data['group_id'] = self.node.group.id
            data['group_name'] = self.node.group.name
            if current_user_id is not None and self.node.group.owner_id == current_user_id:
                data['is_current_user_group_owner'] = True
        return data
    
class GroupMember(db.Model):
    __tablename__ = "group_member"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    # +++ NEW: is_owner flag +++
    is_owner: Mapped[bool] = mapped_column(default=False, nullable=False)


    user: Mapped["User"] = relationship(back_populates="groups")
    group: Mapped["Group"] = relationship(back_populates="members")

class EventRSVP(db.Model):
    __tablename__ = "event_rsvp"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    status: Mapped[str] = mapped_column(String(50))  # attending, maybe, declined
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User", back_populates="rsvps")
    event: Mapped["Event"] = relationship("Event", back_populates="attendees")

    __table_args__ = (db.UniqueConstraint('user_id', 'event_id', name='_user_event_uc'),)

class InvitedGuest(db.Model):
    __tablename__ = "invited_guest"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    email: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(120), nullable=True)

    event = relationship("Event", back_populates="guests")

class Message(db.Model):
    __tablename__ = "message"

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("user.id"),  nullable=False)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("user.id"),  nullable=False)
    body: Mapped[str] = mapped_column(String(140),  nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, default=datetime.now(timezone.utc))

    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id], back_populates="messages_sent")
    recipient: Mapped["User"] = relationship("User", foreign_keys=[recipient_id], back_populates="messages_received")

    def __repr__(self):
        return f"<Message {self.body}>"


# --- NEW: InsightPanel Model ---
class InsightPanel(db.Model):
    __tablename__ = "insight_panel"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    analysis_type: Mapped[str] = mapped_column(String(80), nullable=False) # e.g., 'spending-by-category'
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Use JSON or Text for configuration, JSON is more structured if your DB supports it
    # For SQLite, Text is safer unless you configure JSON support explicitly.
    configuration: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # Example: {"time_period": "last_month"}
    # configuration: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # Alternative using Text

    # Relationship back to User
    user: Mapped["User"] = relationship("User", back_populates="insight_panels")
    shares_received: Mapped[List["SharedInsightPanel"]] = relationship("SharedInsightPanel", back_populates="original_panel", cascade="all, delete-orphan")

    def to_dict(self):
        """Serializes the InsightPanel object to a dictionary."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "analysis_type": self.analysis_type,
            "title": self.title,
            "description": self.description,
            "display_order": self.display_order,
            "configuration": self.configuration 
        }

    def __repr__(self):
        return f"<InsightPanel {self.id} (User: {self.user_id}, Type: {self.analysis_type}, Order: {self.display_order})>"
    
class SharedInsightPanel(db.Model):
    __tablename__ = "shared_insight_panel"

    id: Mapped[int] = mapped_column(primary_key=True)
    original_panel_id: Mapped[int] = mapped_column(ForeignKey("insight_panel.id", name="fk_shared_original_panel_id"), nullable=False)
    sharer_id: Mapped[int] = mapped_column(ForeignKey("user.id", name="fk_shared_sharer_id"), nullable=False)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("user.id", name="fk_shared_recipient_id"), nullable=False)
    shared_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    access_mode: Mapped[str] = mapped_column(String(20), nullable=False)  # 'fixed' or 'dynamic'
    
    # Stores the configuration (especially group_id, startDate, endDate) that was active
    # when the panel was shared in 'fixed' mode.
    # For 'dynamic' mode, this might store the initial group_id context from the sharer.
    shared_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    original_panel: Mapped["InsightPanel"] = relationship("InsightPanel", back_populates="shares_received")
    sharer: Mapped["User"] = relationship("User", foreign_keys=[sharer_id], backref="panels_shared_by_me")
    recipient: Mapped["User"] = relationship("User", foreign_keys=[recipient_id], backref="panels_shared_with_me")

    __table_args__ = (db.UniqueConstraint('original_panel_id', 'recipient_id', name='_original_panel_recipient_uc'),)

    def to_dict_for_recipient(self):
        """Prepares data for the recipient, merging with original panel details."""
        original_panel_data = self.original_panel.to_dict()
        # Override title with original panel's title, recipient doesn't set this
        original_panel_data['title'] = self.original_panel.title 
        
        # Specific fields for the shared instance
        original_panel_data.update({
            "shared_instance_id": self.id, # Distinguish from original_panel.id on frontend
            "original_panel_id_ref": self.original_panel_id, # Reference to the actual panel
            "is_shared": True,
            "sharer_id": self.sharer_id,
            "sharer_username": self.sharer.username,
            "shared_at": self.shared_at.isoformat() if self.shared_at else None,
            "access_mode": self.access_mode,
            # The shared_config itself is crucial for frontend to setup controls
            # and for backend to correctly fetch data for 'fixed' mode.
            "current_config_for_display": self.shared_config # This is the key config for display/control setup
        })
        # The recipient doesn't directly use the original_panel's saved 'configuration' for display.
        # They use 'shared_config' for fixed mode, or their own transient filters for dynamic mode.
        # So, remove original_panel.configuration from the dict sent to recipient to avoid confusion.
        if 'configuration' in original_panel_data and self.access_mode == 'fixed':
            # For fixed, the shared_config IS the configuration.
             original_panel_data['configuration'] = self.shared_config
        elif 'configuration' in original_panel_data and self.access_mode == 'dynamic':
             # For dynamic, the recipient starts with shared_config's group, but can change time.
             # The base 'configuration' is still from original panel for non-overridden parts.
             # We'll let frontend handle initial state from current_config_for_display.
             # To be safe, ensure `configuration` field has the dynamic base settings
             original_panel_data['configuration'] = self.original_panel.configuration.copy() if self.original_panel.configuration else {}
             if self.shared_config and 'group_id' in self.shared_config:
                 original_panel_data['configuration']['group_id'] = self.shared_config['group_id']


        return original_panel_data
# --- END OF FILE app/models.py ---