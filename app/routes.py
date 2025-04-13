from flask import render_template, redirect, url_for, flash
from app import app
from app.forms import LoginForm, SignupForm

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
def main():
    return render_template('mainpage.html', groups=groups)

@app.route('/index')
def index():
    return render_template('index.html', user=user, groups=groups)

@app.route('/login', methods=['GET', 'POST'])
def login():
    form = LoginForm()
    if form.validate_on_submit():
        # You can validate against users here
        flash(f"Welcome back, {form.username.data}!", "success")
        return redirect(url_for('main'))  # or whatever route is your homepage
    return render_template('login.html', form=form)

@app.route('/register', methods=['GET', 'POST'])
def register():
    form = SignupForm()
    if form.validate_on_submit():
        # Do signup logic (e.g., check if user exists, save to db)
        flash(f'Account created for {form.username.data}!', 'success')
        return redirect(url_for('login'))  # or 'main', or wherever

    return render_template('register.html', form=form)