from flask import Flask

app = Flask(__name__)
app.config['SECRET_KEY'] = 'lol' # Replace with a secure key in production

from app import routes