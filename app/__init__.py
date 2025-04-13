from flask import Flask
from config import Config
from dotenv import load_dotenv
load_dotenv('.flaskenv')  # Load environment variables from .flaskenv
import os

app = Flask(__name__)
app.config.from_object(Config) 

from app import routes