# --- START OF FILE models.py ---

from app import db, login
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin, current_user
from hashlib import md5
from datetime import datetime, timezone
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, DateTime, ForeignKey, Float, text, Text # Added Text type
from typing import Annotated, Optional, List


group_members = db.Table('group_members',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id')),
    db.Column('group_id', db.Integer, db.ForeignKey('groups.id'))
)

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
        if not self.is_friend(user):
            self.friends.append(user)

    def remove_friend(self, user):
        if self.is_friend(user):
            self.friends.remove(user)

    def is_friend(self, user):
        return self.friends.filter(friends.c.friend_id == user.id).count() > 0
    
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
    about: Mapped[str] = mapped_column(String(255), nullable=True)

    members: Mapped[List["GroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )

    posts: Mapped[List["Post"]] = relationship(
    back_populates="group", cascade="all, delete-orphan"
    )

    nodes: Mapped[List["Node"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )

    @property
    def avatar(self, size=128):
        if self.avatar_url:
            return self.avatar_url
        # fallback: generate based on group name hash
        digest = md5(str(self.id).lower().encode('utf-8')).hexdigest()
        return f'https://www.gravatar.com/avatar/{digest}?d=identicon&s={size}'

    def to_dict(self, include_nodes=True):
        data = {
            "id": self.id,
            "name": self.name,
            "avatar_url": self.avatar,
            "about": self.about
        }

        if include_nodes:
            data["event_nodes"] = [node.to_dict() for node in self.nodes]

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

    def to_dict(self, include_events: bool = False):
        data = {
            "id": self.id,
            "label": self.label,
            "x": self.x,
            "y": self.y,
            "group_id": self.group_id,
        }

        if include_events:
            data["events"] = [event.to_dict() for event in self.events]

        return data


class Event(db.Model):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    location: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(240), nullable=True)
    image_url: Mapped[str] = mapped_column(String(255), nullable=True)
    cost_display: Mapped[str] = mapped_column(String(50), nullable=True) # User-facing display string
    cost_value: Mapped[Optional[Float]] = mapped_column(Float, nullable=True) # Actual numeric cost for calculations
    node_id: Mapped[Optional[int]] = mapped_column(ForeignKey("nodes.id"), nullable=True)

    # Relationships
    node: Mapped[Optional["Node"]] = relationship("Node", back_populates="events") # Optional if node_id can be null

    attendees: Mapped[List["EventRSVP"]] = relationship("EventRSVP", back_populates="event", cascade="all, delete-orphan")
    guests: Mapped[List["InvitedGuest"]] = relationship("InvitedGuest", back_populates="event")

    # --- MODIFIED to_dict ---
    def to_dict(self, current_user_id=None):
        """Serializes the Event object to a dictionary, optionally including the
           RSVP status for the specified user."""
        data = {
            "id": self.id,
            "title": self.title,
            "date": self.date.isoformat().replace('+00:00', 'Z') if self.date and isinstance(self.date, datetime) else None,
            "location": self.location,
            "description": self.description,
            "image_url": self.image_url,
            "cost_display": self.cost_display,
            "cost_value": self.cost_value, # Include numeric cost
            "node_id": self.node_id,
            "current_user_rsvp_status": None
        }

        if current_user_id is not None:
            from app.models import EventRSVP
            my_rsvp = db.session.execute(
                db.select(EventRSVP).filter_by(event_id=self.id, user_id=current_user_id)
            ).scalar_one_or_none()

            if my_rsvp:
                data['current_user_rsvp_status'] = my_rsvp.status

        return data

class GroupMember(db.Model):
    __tablename__ = "group_member"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))

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

    def to_dict(self):
        """Serializes the InsightPanel object to a dictionary."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "analysis_type": self.analysis_type,
            "title": self.title,
            "description": self.description,
            "display_order": self.display_order,
            "configuration": self.configuration # Will be dict or None if using JSON type
            # "configuration": json.loads(self.configuration) if self.configuration else None # If using Text type
        }

    def __repr__(self):
        return f"<InsightPanel {self.id} (User: {self.user_id}, Type: {self.analysis_type}, Order: {self.display_order})>"


# --- END OF FILE models.py ---
