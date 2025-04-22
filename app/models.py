from app import db, login
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from hashlib import md5 
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, DateTime, ForeignKey, Float, text
from typing import Annotated, Optional

class User(UserMixin, db.Model): 
    __tablename__ = "user"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    email: Mapped[str] = mapped_column(String(120), index=True, unique=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    about_me: Mapped[str] = mapped_column(String(140), default="")
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
    __tablename__ = "group"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    about: Mapped[str] = mapped_column(String(140))
    avatar_url: Mapped[str] = mapped_column(String(140))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="group", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Group {self.name}>"
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "about": self.about,
            "avatar_url": self.avatar_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

class GroupMember(db.Model):
    __tablename__ = "group_member"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    group_id: Mapped[int] = mapped_column(ForeignKey("group.id"))

    user = relationship("User", back_populates="groups")
    group = relationship("Group", back_populates="members")

class Event(db.Model):
    __tablename__ = "event"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    date: Mapped[datetime]
    group_id: Mapped[int] = mapped_column(ForeignKey("group.id"))
    description: Mapped[str] = mapped_column(String(240))
    location: Mapped[str] = mapped_column(String(120))

    x: Mapped[float] = mapped_column(Float, nullable=True)
    y: Mapped[float] = mapped_column(Float, nullable=True)

    group = relationship("Group", back_populates="events")
    attendees = relationship("EventRSVP", back_populates="event", cascade="all, delete-orphan")
    guests = relationship("InvitedGuest", back_populates="event")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "date": self.date.isoformat() if self.date else None,
            "group_id": self.group_id,
            "location": self.location,
            "x": self.x,
            "y": self.y
        }

class EventRSVP(db.Model):
    __tablename__ = "event_rsvp"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    event_id: Mapped[int] = mapped_column(ForeignKey("event.id"))
    status: Mapped[str] = mapped_column(String(50))  # going / maybe / declined

    user = relationship("User", back_populates="rsvps")
    event = relationship("Event", back_populates="attendees")

class InvitedGuest(db.Model):
    __tablename__ = "invited_guest"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("event.id"))
    email: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(120), nullable=True)

    event = relationship("Event", back_populates="guests")