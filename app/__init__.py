from flask import Flask
from dotenv import load_dotenv
load_dotenv('.flaskenv')  # Load environment variables from .flaskenv
import os

# This will automatically read from the .flaskenv / .env if using Flask CLI
SECRET_KEY = os.environ.get('SECRET_KEY')

app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET_KEY

from app import routes