from flask import Flask
from flask import redirect, url_for
from config import Config
from dotenv import load_dotenv
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
load_dotenv('.flaskenv')  # Load environment variables from .flaskenv
import os

from flask_sqlalchemy import SQLAlchemy 
from flask_migrate import Migrate 

app = Flask(__name__)
app.config.from_object(Config) 

csrf = CSRFProtect(app)

db = SQLAlchemy(app) 
migrate = Migrate(app, db) 
login = LoginManager(app) 


@login.unauthorized_handler
def unauthorized():
   return redirect(url_for('login'))  # Redirect without flashing a message

from app import routes, models