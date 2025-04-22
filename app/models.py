from app import db, login
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from hashlib import md5 
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime
from typing import Annotated, Optional

class User(UserMixin, db.Model): 
    __tablename__ = "user"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), index=True, unique=True)
    email: Mapped[str] = mapped_column(String(120), index=True, unique=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    about_me: Mapped[str] = mapped_column(String(140))
    last_active: Mapped[datetime] = mapped_column(DateTime, default=datetime)

    def __repr__(self): 
        return '<User {}>'.format(self.username)
    
    def set_password(self, password): 
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256') 

    def check_password(self, password): 
        return check_password_hash(self.password_hash, password) 
    
    def avatar(self, size): 
        digest = md5(self.email.lower().encode('utf-8')).hexdigest() 
        return 'https://www.gravatar.com/avatar/{}?d=identicon&s={}'.format( 
            digest, size)

@login.user_loader 
def load_user(id): 
    return User.query.get(int(id)) 