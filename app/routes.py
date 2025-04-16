from flask import render_template, redirect, url_for, flash, request
from app import app, db
from app.forms import LoginForm, RegistrationForm
from flask_login import current_user, login_user, logout_user, login_required
from app.models import User 
from urllib.parse import urlparse

groups = [
    {
        'id': 'hikers',
        'name': 'Weekend Hikers',
        'avatar_url': 'https://via.placeholder.com/40/A0AECF/FFFFFF?text=G1',
        'upcoming_event_count': 2, # Example calculation
        'events': [
            {
                'id': 1,
                'title': 'Mountain Hike Day',
                'image_url': 'https://via.placeholder.com/150/BEE3F8/2A4365?text=Hike+Img',
                'date_iso': '2023-11-25T09:00:00', # ISO format for JS parsing
                'formatted_date': 'Sat, Nov 25 @ 9:00 AM', # Pre-formatted for display
                'cost_display': '$5',
                'location': 'Eagle Peak Trail',
                'rsvp_status': 'Going'
            },
            {
                'id': 5,
                'title': 'Coastal Trail Walk',
                'image_url': 'https://via.placeholder.com/150/A0AECF/FFFFFF?text=Walk+Img',
                'date_iso': '2023-12-02T10:00:00',
                'formatted_date': 'Sat, Dec 2 @ 10:00 AM',
                'cost_display': 'Free',
                'location': 'Seaview Path',
                'rsvp_status': 'Invited'
            },
             { # Example Past Event for filtering
                'id': 8,
                'title': 'Previous Hike Prep Meeting',
                'image_url': 'https://via.placeholder.com/150/A0AECF/999999?text=Past+Hike',
                'date_iso': '2023-10-15T19:00:00',
                'formatted_date': 'Sun, Oct 15 @ 7:00 PM',
                'cost_display': 'Free',
                'location': 'Online',
                'rsvp_status': 'Going'
            },
        ]
    },
    {
        'id': 'boardgames',
        'name': 'Board Game Geeks',
        'avatar_url': 'https://via.placeholder.com/40/FEEBC8/9C4221?text=G2',
        'upcoming_event_count': 1,
        'events': [
            # ... events for board game geeks ...
        ]
    },
    # ... more groups
]

user = {
    'username': 'johndoe',
}
@app.route('/')
@app.route('/index') 
#@login_required 
def index():
    return render_template('index.html', title='Home Page', groups=groups)

@app.route('/login', methods=['GET', 'POST']) 
def login(): 
    if current_user.is_authenticated: 
        return redirect(url_for('index')) 
    form = LoginForm() 
    if form.validate_on_submit(): 
        user = User.query.filter_by(username=form.username.data).first() 
        if user is None or not user.check_password(form.password.data): 
            flash('Invalid username or password') 
            return redirect(url_for('login')) 
        login_user(user, remember=form.remember_me.data) 
        next_page = request.args.get('next') 
        if not next_page or urlparse(next_page).netloc != '': 
            next_page = url_for('index') 
        return redirect(next_page) 
    return render_template('login.html', title='Sign In', form=form) 

@app.route('/register', methods=['GET', 'POST'])
def register():
    form = RegistrationForm() 
    if form.validate_on_submit(): 
        user = User(username=form.username.data, email=form.email.data) 
        user.set_password(form.password.data) 
        db.session.add(user) 
        db.session.commit() 
        flash(f'Account created for {form.username.data}!', 'success')
        return redirect(url_for('login')) 
    return render_template('register.html', form=form)

@app.route('/logout') 
def logout(): 
    logout_user() 
    return redirect(url_for('index')) 

@app.route('/profile')
def profile():
    return render_template('profile.html', user=user, groups=groups)

@app.route('/explore')
def explore():
    return render_template('explore.html', groups=groups)

@app.route('/planner')
def planner():
    return render_template('planner.html', groups=groups)