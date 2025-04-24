from app import db, login
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from hashlib import md5 
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, DateTime, ForeignKey, Float, text
from typing import Annotated, Optional, List

class User(UserMixin, db.Model): 
    __tablename__ = "user"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    email: Mapped[str] = mapped_column(String(120), index=True, unique=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    about_me: Mapped[str] = mapped_column(String(140), nullable=True)
    last_active: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    groups = relationship("GroupMember", back_populates="user")
    rsvps = relationship("EventRSVP", back_populates="user")

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

    nodes: Mapped[List["Node"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )

    def to_dict(self, include_nodes=True):
        data = {
            "id": self.id,
            "name": self.name,
            "avatar_url": self.avatar_url,
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
    date: Mapped[datetime]
    location: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(240))
    image_url: Mapped[str] = mapped_column(String(255), nullable=True)
    cost_display: Mapped[str] = mapped_column(String(50), nullable=True)
    rsvp_status: Mapped[str] = mapped_column(String(50), nullable=True)

    x: Mapped[float] = mapped_column(Float, nullable=True)
    y: Mapped[float] = mapped_column(Float, nullable=True)

    node_id: Mapped[Optional[int]] = mapped_column(ForeignKey("nodes.id"), nullable=True)

    # Relationships
    node = relationship("Node", back_populates="events")

    attendees = relationship("EventRSVP", back_populates="event", cascade="all, delete-orphan")
    guests = relationship("InvitedGuest", back_populates="event")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "date": self.date.isoformat().replace('+00:00', '') + "Z" if self.date else None,
            "location": self.location,
            "description": self.description,
            "image_url": self.image_url,
            "cost_display": self.cost_display,
            "rsvp_status": self.rsvp_status,
            "x": self.x,
            "y": self.y,
            "node_id": self.node_id
        }
    
class GroupMember(db.Model):
    __tablename__ = "group_member"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))

    user = relationship("User", back_populates="groups")
    group = relationship("Group", back_populates="members")

class EventRSVP(db.Model):
    __tablename__ = "event_rsvp"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    status: Mapped[str] = mapped_column(String(50))  # going / maybe / declined

    user = relationship("User", back_populates="rsvps")
    event = relationship("Event", back_populates="attendees")

class InvitedGuest(db.Model):
    __tablename__ = "invited_guest"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    email: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(120), nullable=True)

    event = relationship("Event", back_populates="guests")