import os
from dotenv import load_dotenv

# --- Step 1: Load environment variables ---
# This should be at the VERY TOP, before importing your 'app' module
# as 'app/__init__.py' might try to access os.environ immediately.
dotenv_path = os.path.join(os.path.dirname(__file__), '.flaskenv')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    print(f"Warning: .flaskenv file not found at {dotenv_path}. Environment variables (like SECRET_KEY) might not be set.")

# --- Step 2: Now import your app and other components ---
# This assumes your app/__init__.py is correctly setting app.config['SECRET_KEY']
# using os.environ.get('SECRET_KEY')
from app import app, db
from app.models import User # Assuming User model is in app/models.py

# --- Step 3: Shell context processor (this part was fine) ---
@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'User': User}

# --- Step 4: Main execution block ---
if __name__ == "__main__":
    # The FLASK_ENV variable should be read by your app configuration
    # (e.g., in app/__init__.py or a Config class) to set app.debug.
    # If not, you can set it explicitly here based on the env var:
    # debug_mode = os.environ.get('FLASK_ENV') == 'development'
    # app.run(debug=debug_mode)

    # Or, if your app's __init__.py already configures app.debug based on FLASK_ENV:
    app.run()