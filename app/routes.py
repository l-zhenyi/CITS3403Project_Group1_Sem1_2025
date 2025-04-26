from flask import render_template, redirect, url_for, flash, request, session, jsonify
from app import app, db
from app.forms import LoginForm, RegistrationForm, EditProfileForm
from flask_login import current_user, login_user, logout_user, login_required
from app.models import User, Group, GroupMember, Event, EventRSVP, Node
from urllib.parse import urlparse
from datetime import datetime, timezone
from dateutil.parser import isoparse

@app.route('/')
@app.route('/index') 
@login_required 
def index():
    return render_template('index.html', title='Home Page')

@app.before_request 
def before_request(): 
    if current_user.is_authenticated: 
        current_user.last_seen = datetime.now(timezone.utc) 
        db.session.commit() 

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
    return render_template('login.html', title='Sign In', form=form, hide_nav=True) 

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
@login_required 
def profile():
    return render_template('profile.html', user=user)

@app.route('/explore')
@login_required 
def explore():
    return render_template('explore.html')

@app.route('/planner')
@login_required 
def planner():
    return render_template('planner.html')

@app.route('/user/<username>') 
@login_required 
def user(username): 
    user = User.query.filter_by(username=username).first_or_404() 
    return render_template('user.html', user=user)
 
@app.route('/edit_profile', methods=['GET', 'POST']) 
@login_required 
def edit_profile(): 
    form = EditProfileForm() 
    if form.validate_on_submit(): 
        current_user.username = form.username.data 
        current_user.about_me = form.about_me.data 
        db.session.commit() 
        flash('Your changes have been saved.') 
        return redirect(url_for('edit_profile')) 
    elif request.method == 'GET': 
        form.username.data = current_user.username 
        form.about_me.data = current_user.about_me 
    return render_template('edit_profile.html', title='Edit Profile', form=form)

@app.route("/api/groups/<int:group_id>/events")
def get_group_events(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "Group not found"}), 404
    nodes = [
        node.to_dict(include_events=True) for node in group.nodes
    ] if hasattr(group, "nodes") else []

    return jsonify({
        "nodes": nodes
    })

@app.route('/api/groups', methods=['POST'])
def create_group():
    data = request.get_json()
    group = Group(
        name=data.get("name"),
        avatar_url=data.get("avatar_url"),
        about="New group"
    )
    db.session.add(group)
    db.session.commit()
    return jsonify(group.to_dict()), 201

@app.route('/api/groups', methods=['GET'])
def get_groups():
    groups = Group.query.all()
    return jsonify([g.to_dict() for g in groups])

@app.route('/api/groups/<int:group_id>/events', methods=['POST'])
def create_event(group_id):
    data = request.get_json()
    iso_str = data.get("date")
    try:
        # Handle timezone info correctly if present (e.g., Z or +00:00)
        # isoparse usually handles this well. Ensure DB stores UTC ideally.
        parsed_date = isoparse(iso_str) if iso_str else datetime.now(timezone.utc)
    except (ValueError, TypeError):
        # Handle cases where date is missing or invalid format
        # Log the error? Use a default? Return 400?
        # Using UTC now as a fallback, adjust if needed.
        parsed_date = datetime.now(timezone.utc)
        # Or: return jsonify({"error": "Invalid or missing date format"}), 400

    event = Event(
        title=data.get("title", "Untitled Event"), # Add default title
        date=parsed_date,
        location=data.get("location", "TBD"), # Add default location
        description=data.get("description"),
        x=data.get("x"),
        y=data.get("y"),
        node_id=data.get("node_id")
    )
    db.session.add(event)
    db.session.commit()

    # event.to_dict() will now include the saved node_id
    return jsonify(event.to_dict()), 201

@app.route('/api/groups/<int:group_id>/nodes', methods=['POST'])
def create_node(group_id):
    data = request.get_json()
    node = Node(
        label=data.get("label", "Untitled Node"), # Add default label
        x=data.get("x", 0), # Default x position
        y=data.get("y", 0), # Default y position
        group_id=group_id
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201

@app.route('/api/events/<event_id>', methods=['PATCH'])
def rename_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json()
    if 'title' in data:
        event.title = data['title']
    
    db.session.commit()
    return jsonify(event.to_dict()) 

@app.route('/api/nodes/<int:node_id>', methods=['PATCH'])
def update_node(node_id):
    node = Node.query.get_or_404(node_id)
    data = request.get_json()

    # Allow renaming
    if 'label' in data:
        node.label = data['label']

    # Existing position update
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']

    db.session.commit()
    return jsonify(node.to_dict()) 

@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    return '', 204

@app.route('/api/nodes/<int:node_id>', methods=['DELETE'])
def delete_node(node_id):
    node = Node.query.get_or_404(node_id)

    for event in node.events:
        db.session.delete(event)

    db.session.delete(node)
    db.session.commit()
    return '', 204