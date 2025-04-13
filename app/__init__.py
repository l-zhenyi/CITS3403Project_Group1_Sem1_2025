from flask import Flask
from config import Config
from dotenv import load_dotenv
from flask_login import LoginManager
load_dotenv('.flaskenv')  # Load environment variables from .flaskenv
import os

from flask_sqlalchemy import SQLAlchemy 
from flask_migrate import Migrate 

app = Flask(__name__)
app.config.from_object(Config) 
db = SQLAlchemy(app) 
migrate = Migrate(app, db) 
login = LoginManager(app) 
login.login_view = 'login'

from app import routes, models