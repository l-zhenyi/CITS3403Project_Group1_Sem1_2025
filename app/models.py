from app import db, login
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer
from typing import Annotated, Optional

class User(UserMixin, db.Model): 
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    email: Mapped[str] = mapped_column(String(120), index=True, unique=True)
    password_hash: Mapped[str] = mapped_column(String(128))

    def __repr__(self) -> str:
        return f"<User {self.username}>"
    
    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

@login.user_loader
def load_user(id: str) -> Optional[User]:
    return db.session.get(User, int(id))