# --- Imports ---
from flask import render_template, redirect, url_for, flash, request, session, jsonify, abort
from app import app, db
from app.forms import LoginForm, RegistrationForm, EditProfileForm, EmptyForm, PostForm, CreateGroupForm, MessageForm
from flask_login import current_user, login_user, logout_user, login_required
from app.models import User, Group, GroupMember, Event, EventRSVP, Node, Post, Message, InvitedGuest
from urllib.parse import urlparse
from datetime import datetime, timezone
from dateutil.parser import isoparse
from functools import wraps
from sqlalchemy.orm import aliased, joinedload

# --- Helper Functions ---
def is_group_member(user_id, group_id):
    return GroupMember.query.filter_by(user_id=user_id, group_id=group_id).first() is not None

def node_belongs_to_group(node_id, group_id):
    node = Node.query.get(node_id)
    return node is not None and node.group_id == group_id

def require_group_member(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        group_id = kwargs.get('group_id')
        if group_id is None:
            abort(400, description="Missing group_id in route.")
        if not current_user.is_authenticated or not is_group_member(current_user.id, group_id):
            return jsonify({"error": "You are not authorized for this group."}), 403
        return f(*args, **kwargs)
    return decorated_function

# --- Basic Pages ---

@app.before_request
def before_request():
    if current_user.is_authenticated:
        current_user.last_seen = datetime.now(timezone.utc)
        db.session.commit()

@app.route('/', methods=['GET', 'POST'])
@app.route('/index', methods=['GET', 'POST'])
@login_required
def index():
    form = PostForm()
    if form.validate_on_submit():
        post = Post(body=form.post.data, author=current_user)
        db.session.add(post)
        db.session.commit()
        flash('Your post is now live!')
        return redirect(url_for('index'))

    page = request.args.get('page', 1, type=int)
    posts = current_user.followed_posts().paginate(page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)
    groups = Group.query.join(GroupMember).filter(GroupMember.user_id == current_user.id).all()

    return render_template('index.html', title='Home', form=form, posts=posts.items,
                           next_url=url_for('index', page=posts.next_num) if posts.has_next else None,
                           prev_url=url_for('index', page=posts.prev_num) if posts.has_prev else None,
                           groups=groups, user=current_user)

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
    return render_template('profile.html', user=current_user)

@app.route('/explore')
@login_required
def explore():
    return render_template('explore.html', title='Explore')

@app.route('/planner')
@login_required
def planner():
    return render_template('planner.html')

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

@app.route('/user/<username>')
@login_required
def user(username):
    user = User.query.filter_by(username=username).first_or_404()
    page = request.args.get('page', 1, type=int)
    posts = current_user.followed_posts().paginate(page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)

    form = EmptyForm()

    group_member_alias = aliased(GroupMember)

    shared_groups = (
        Group.query
        .join(GroupMember, Group.id == GroupMember.group_id)
        .filter(GroupMember.user_id == current_user.id)
        .join(group_member_alias, Group.id == group_member_alias.group_id)
        .filter(group_member_alias.user_id == user.id)
        .all()
    )

    return render_template('user.html', user=user, posts=posts.items,
                           next_url=url_for('user', username=user.username, page=posts.next_num) if posts.has_next else None,
                           prev_url=url_for('user', username=user.username, page=posts.prev_num) if posts.has_prev else None,
                           form=form, groups=shared_groups)

@app.route('/follow/<username>', methods=['POST'])
@login_required
def follow(username):
    form = EmptyForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=username).first()
        if user is None:
            flash(f'User {username} not found.')
            return redirect(url_for('index'))
        if user == current_user:
            flash('You cannot follow yourself!')
            return redirect(url_for('user', username=username))
        current_user.follow(user)
        db.session.commit()
        flash(f'You are following {username}!')
        return redirect(url_for('user', username=username))
    return redirect(url_for('index'))

@app.route('/unfollow/<username>', methods=['POST'])
@login_required
def unfollow(username):
    form = EmptyForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=username).first()
        if user is None:
            flash(f'User {username} not found.')
            return redirect(url_for('index'))
        if user == current_user:
            flash('You cannot unfollow yourself!')
            return redirect(url_for('user', username=username))
        current_user.unfollow(user)
        db.session.commit()
        flash(f'You are not following {username}.')
        return redirect(url_for('user', username=username))
    return redirect(url_for('index'))

# --- Group Routes ---

@app.route("/create_group", methods=["GET", "POST"])
@login_required
def create_group():
    form = CreateGroupForm()
    if form.validate_on_submit():
        group = Group(name=form.name.data, about=form.about.data)
        db.session.add(group)
        db.session.flush()
        db.session.add(GroupMember(group_id=group.id, user_id=current_user.id))
        db.session.commit()
        flash("Group created successfully!", "success")
        return redirect(url_for("view_group", group_id=group.id))
    return render_template("create_group.html", form=form)

@app.route("/groups/<int:group_id>", methods=["GET", "POST"])
@login_required
def view_group(group_id):
    group = Group.query.get_or_404(group_id)
    if not is_group_member(current_user.id, group_id):
        flash("You are not authorized to view this group.", "danger")
        return redirect(url_for('index')) # Or show a 403 page
    form = PostForm()

    if form.validate_on_submit():
        post = Post(
            body=form.post.data,
            author=current_user,
            group=group,
            timestamp=datetime.now(timezone.utc)
        )
        db.session.add(post)
        db.session.commit()
        flash("Post created!")
        return redirect(url_for('view_group', group_id=group.id))

    page = request.args.get('page', 1, type=int)
    pagination = Post.query.filter_by(group_id=group.id).order_by(Post.timestamp.desc()) \
        .paginate(page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)
    posts = pagination.items

    return render_template("view_group.html", group=group, posts=posts, form=form, pagination=pagination,
                           next_url=url_for('view_group', group_id=group.id, page=pagination.next_num) if pagination.has_next else None,
                           prev_url=url_for('view_group', group_id=group.id, page=pagination.prev_num) if pagination.has_prev else None)

@app.route("/group/<int:group_id>/add_members", methods=["GET", "POST"])
@login_required
def add_members(group_id):
    group = Group.query.get_or_404(group_id)
    if not is_group_member(current_user.id, group_id):
         flash("You are not authorized to manage members for this group.", "danger")
         return redirect(url_for('view_group', group_id=group_id)) # Or 403

    if request.method == 'POST':
        username = request.form.get('username')
        user_to_add = User.query.filter_by(username=username).first()

        if not user_to_add:
            flash('User not found.')
            return redirect(url_for('add_members', group_id=group_id))

        if not (current_user.is_following(user_to_add) and user_to_add.is_following(current_user)):
            flash('You can only add users who mutually follow you.')
            return redirect(url_for('add_members', group_id=group_id))

        existing_member = GroupMember.query.filter_by(user_id=user_to_add.id, group_id=group_id).first()
        if existing_member:
            flash('User is already a group member.')
            return redirect(url_for('add_members', group_id=group_id))

        new_membership = GroupMember(user_id=user_to_add.id, group_id=group_id)
        db.session.add(new_membership)
        db.session.commit()

        flash(f'{user_to_add.username} has been added to the group!')
        return redirect(url_for('view_group', group_id=group_id))

    return render_template('add_members.html', group=group)

# --- Messaging Routes ---

@app.route('/send_message/<recipient>', methods=['GET', 'POST'])
@login_required
def send_message(recipient):
    user = User.query.filter_by(username=recipient).first_or_404()
    form = MessageForm()
    if form.validate_on_submit():
        msg = Message(sender=current_user, recipient=user, body=form.message.data)
        db.session.add(msg)
        db.session.commit()
        flash('Your message has been sent.')
        return redirect(url_for('user', username=recipient))
    return render_template('send_message.html', title='Send Message', form=form, recipient=recipient)

@app.route('/messages')
@login_required
def messages():
    current_user.last_message_read_time = datetime.now(timezone.utc)
    db.session.commit()
    page = request.args.get('page', 1, type=int)
    messages = Message.query.filter_by(recipient_id=current_user.id) \
        .order_by(Message.timestamp.desc()) \
        .paginate(page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)

    return render_template('messages.html', messages=messages.items,
                           next_url=url_for('messages', page=messages.next_num) if messages.has_next else None,
                           prev_url=url_for('messages', page=messages.prev_num) if messages.has_prev else None)

# --- Search Route ---

@app.route('/search', methods=['GET'])
@login_required
def search_users():
    search_query = request.args.get('username', '')
    users = User.query.filter(User.username.ilike(f'%{search_query}%')).all() if search_query else []
    return render_template('search_users.html', users=users)

# --- API Routes (SECURED) ---

@app.route("/api/groups", methods=["GET"])
@login_required
def get_groups():
    groups = Group.query.join(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    return jsonify([g.to_dict() for g in groups])

@app.route("/api/groups", methods=["POST"])
@login_required
def create_group_api():
    data = request.get_json() or {}
    name = data.get("name")
    if not name:
        return jsonify({"error": "Group name is required"}), 400

    group = Group(name=name, avatar_url=data.get("avatar_url"), about=data.get("about", "New group"))
    db.session.add(group)
    db.session.flush()

    db.session.add(GroupMember(group_id=group.id, user_id=current_user.id))
    db.session.commit()
    return jsonify(group.to_dict()), 201

@app.route("/api/groups/<int:group_id>/nodes", methods=["GET"]) # This is the route your eventRenderer.js calls
@login_required
@require_group_member
def get_group_nodes(group_id): # Renamed function (this is the correct function name based on the route)
    """
    Gets nodes for a specific group.
    Optionally includes nested events via ?include=events query parameter.
    <-- THIS IS WHERE THE LOGIC NEEDS TO BE ADDED/CHECKED -->
    """
    group = Group.query.get_or_404(group_id) # Use get_or_404 for better error handling

    include_events_flag = request.args.get('include') == 'events'

    # Optimization consideration: If including events, load them eagerly
    query = Node.query.filter_by(group_id=group_id)
    if include_events_flag:
        # This helps avoid N+1 queries when accessing node.events in to_dict
        query = query.options(joinedload(Node.events))

    nodes = query.all()

    # --- PREVIOUS VERSION (doesn't pass current_user.id to to_dict) ---
    # nodes_data = [node.to_dict(include_events=include_events_flag) for node in nodes]
    # --- END PREVIOUS VERSION ---

    # --- NEW VERSION (passes current_user.id to to_dict) ---
    # Serialize nodes and their events, passing current_user ID to event serialization
    nodes_data = []
    for node in nodes:
        node_dict = {
            "id": node.id,
            "label": node.label,
            "x": node.x,
            "y": node.y,
            "group_id": node.group_id,
            "events": [] # Initialize events list
        }

        if include_events_flag and node.events:
            # Iterate through the eager-loaded events for this node
            # Call event.to_dict(), passing the current user's ID
            # --- THIS IS THE CRITICAL LINE TO CHECK/DEBUG ---
            node_dict["events"] = [
                event.to_dict(current_user_id=current_user.id) # Pass the ID here
                for event in node.events
            ]
            # --- END CRITICAL LINE ---

        nodes_data.append(node_dict)
    # --- END NEW VERSION ---

    return jsonify(nodes_data) # Return the list directly

# NEW: Endpoint to get a flat list of events for the group
@app.route("/api/groups/<int:group_id>/events", methods=["GET"])
@login_required
@require_group_member
def get_group_events_flat(group_id): # New function name
    """Gets a flat list of all events associated with a group (via its nodes)."""
    # Check if group exists first (optional but good practice)
    group_exists = db.session.query(Group.id).filter_by(id=group_id).first() is not None
    if not group_exists:
        abort(404, description="Group not found") # Return 404 if group doesn't exist

    # Query events by joining through nodes that belong to the target group
    events = Event.query.join(Node).filter(Node.group_id == group_id).all()

    events_data = [event.to_dict() for event in events]
    return jsonify(events_data)

@app.route("/api/groups/<int:group_id>/events", methods=["POST"])
@login_required
@require_group_member
def create_event(group_id):
    data = request.get_json() or {}
    title = data.get("title", "Untitled Event")
    location = data.get("location", "TBD")
    iso_str = data.get("date")
    node_id = data.get("node_id")

    if node_id and not node_belongs_to_group(node_id, group_id):
        return jsonify({"error": "Node does not belong to this group."}), 400

    try:
        date = isoparse(iso_str) if iso_str else datetime.now(timezone.utc)
    except (ValueError, TypeError):
        date = datetime.now(timezone.utc)

    event = Event(title=title, date=date, location=location, description=data.get("description"), node_id=node_id)
    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201

@app.route("/api/groups/<int:group_id>/nodes", methods=["POST"])
@login_required
@require_group_member
def create_node(group_id):
    data = request.get_json() or {}
    label = data.get("label", "Untitled Node")

    node = Node(
        label=label,
        x=data.get("x", 0),
        y=data.get("y", 0),
        group_id=group_id
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201

@app.route("/api/events/<int:event_id>", methods=["PATCH", "DELETE"])
@login_required
def modify_or_delete_event(event_id):
    event = Event.query.get(event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    if event.node_id:
        node = Node.query.get(event.node_id)
        if node and not is_group_member(current_user.id, node.group_id):
            return jsonify({"error": "Unauthorized."}), 403
    else:
        return jsonify({"error": "Orphan event cannot be modified."}), 400

    if request.method == "PATCH":
        data = request.get_json() or {}
        if "title" in data:
            event.title = data["title"]
        db.session.commit()
        return jsonify(event.to_dict())

    if request.method == "DELETE":
        db.session.delete(event)
        db.session.commit()
        return jsonify({"success": True})

@app.route("/api/nodes/<int:node_id>", methods=["PATCH", "DELETE"])
@login_required
def modify_or_delete_node(node_id):
    node = Node.query.get(node_id)
    if not node:
        return jsonify({"error": "Node not found"}), 404

    if not is_group_member(current_user.id, node.group_id):
        return jsonify({"error": "Unauthorized."}), 403

    if request.method == "PATCH":
        data = request.get_json() or {}
        if "label" in data:
            node.label = data["label"]
        if "x" in data:
            node.x = data["x"]
        if "y" in data:
            node.y = data["y"]
        db.session.commit()
        return jsonify(node.to_dict())

    if request.method == "DELETE":
        for event in node.events:
            db.session.delete(event)
        db.session.delete(node)
        db.session.commit()
        return jsonify({"success": True})
    
def _check_event_authorization(event_id, user_id):
    """
    Checks if a user is authorized to interact with an event.
    Authorization is granted if:
    1. The user is a member of the group the event belongs to (via its Node).
    2. OR the user's email is listed in the InvitedGuest table for this event.
    """
    event = Event.query.get(event_id)
    if not event:
        return False, "Event not found", 404 # Event doesn't exist

    # We need the user object to check their email for invites
    user = User.query.get(user_id)
    if not user:
        # This shouldn't typically happen if @login_required is used, but it's a safeguard
        return False, "User performing check not found", 404 # Or maybe 401/403

    # --- Check 1: Group Membership (if applicable) ---
    is_group_member = False
    if event.node_id:
        node = Node.query.get(event.node_id)
        # Check if node exists and has a group_id link
        if node and node.group_id:
            member_check = GroupMember.query.filter_by(user_id=user_id, group_id=node.group_id).first()
            if member_check:
                # User is a group member, grant access immediately
                return True, "Authorized as group member", 200
        # else:
            # If node or group link is missing, we can't check membership.
            # Proceed to check invites. Or you could return an error here if
            # event.node_id should always point to a valid node/group.
            # print(f"Warning: Event {event_id} has node_id {event.node_id} but node/group link is invalid.")
            pass # Continue to check for invites

    # --- Check 2: Invited Guest (if not already authorized as group member) ---
    # Query InvitedGuest table using the user's email and the event ID
    is_invited = InvitedGuest.query.filter_by(event_id=event.id, email=user.email).first()
    if is_invited:
        # User was explicitly invited via email, grant access
        return True, "Authorized as invited guest", 200

    # --- If neither check passed ---
    return False, "You are not authorized for this event (not a group member or invited guest).", 403 # Forbidden

# --- New API Routes for Event Modal ---

@app.route('/api/events/<int:event_id>/attendees', methods=['GET'])
@login_required
def get_event_attendees(event_id):
    """API endpoint to get the list of attendees for a specific event."""
    authorized, message, status_code = _check_event_authorization(event_id, current_user.id)
    if not authorized:
        return jsonify({"error": message}), status_code

    # Query RSVPs for the event, joining with User to get details
    # Eagerly load user details to avoid N+1 queries
    # Filter out potential null/empty statuses if you only want confirmed attendees
    rsvps = EventRSVP.query.options(joinedload(EventRSVP.user))\
                           .filter(EventRSVP.event_id == event_id)\
                           .filter(EventRSVP.status.isnot(None))\
                           .order_by(EventRSVP.timestamp.desc())\
                           .all()

    attendees = []
    for rsvp in rsvps:
        if rsvp.user: # Ensure user exists
            attendees.append({
                'user_id': rsvp.user.id,
                'username': rsvp.user.username,
                'avatar_url': rsvp.user.avatar(128), # Use the avatar method
                'status': rsvp.status
            })

    return jsonify(attendees)

@app.route('/api/events/<int:event_id>/my-rsvp', methods=['GET'])
@login_required
def get_my_rsvp(event_id):
    """API endpoint to get the current user's RSVP status for an event."""
    authorized, message, status_code = _check_event_authorization(event_id, current_user.id)
    if not authorized:
        return jsonify({"error": message}), status_code

    rsvp = EventRSVP.query.filter_by(event_id=event_id, user_id=current_user.id).first()

    status = rsvp.status if rsvp else None # Return None if no RSVP found

    return jsonify({"status": status})


@app.route('/api/events/<int:event_id>/rsvp', methods=['POST'])
@login_required
def update_my_rsvp(event_id):
    """API endpoint for the current user to set/update their RSVP."""
    authorized, message, status_code = _check_event_authorization(event_id, current_user.id)
    if not authorized:
        return jsonify({"error": message}), status_code

    data = request.get_json()
    if not data or 'status' not in data:
        return jsonify({"error": "Missing 'status' in request body"}), 400

    new_status = data['status'] # Can be 'going', 'maybe', 'not_going', or None/null

    # Validate status (allow None/null for clearing RSVP)
    allowed_statuses = ['attending', 'maybe', 'declined', None]
    if new_status not in allowed_statuses:
        return jsonify({"error": f"Invalid status provided. Allowed: {allowed_statuses}"}), 400

    # Find existing RSVP
    rsvp = EventRSVP.query.filter_by(event_id=event_id, user_id=current_user.id).first()

    if new_status is None:
        # User wants to clear their RSVP
        if rsvp:
            db.session.delete(rsvp)
            db.session.commit()
            return jsonify({"message": "RSVP cleared successfully.", "status": None})
        else:
            # No RSVP existed, nothing to clear
            return jsonify({"message": "No existing RSVP to clear.", "status": None})
    else:
        # User wants to set or update their RSVP
        if rsvp:
            # Update existing RSVP
            rsvp.status = new_status
            rsvp.timestamp = datetime.now(timezone.utc) # Update timestamp
            db.session.commit()
            return jsonify({"message": f"RSVP updated to '{new_status}'.", "status": new_status})
        else:
            # Create new RSVP
            new_rsvp = EventRSVP(
                event_id=event_id,
                user_id=current_user.id,
                status=new_status,
                timestamp=datetime.now(timezone.utc)
            )
            db.session.add(new_rsvp)
            db.session.commit()
            return jsonify({"message": f"RSVP successfully set to '{new_status}'.", "status": new_status}), 201 # 201 Created
        
@app.route('/api/search/users', methods=['GET'])
@login_required
def api_search_users():
    """API endpoint for searching users by username (case-insensitive)."""
    query = request.args.get('q', '').strip()
    limit = request.args.get('limit', 10, type=int) # Limit results

    if not query:
        return jsonify([]) # Return empty list if query is empty

    # Basic case-insensitive search using ilike
    # For true fuzzy search, you might need extensions like pg_trgm or libraries
    users_query = User.query.filter(
        User.username.ilike(f'%{query}%')
    ).limit(limit)

    users = users_query.all()

    # Prepare data for JSON response (include necessary fields)
    results = []
    for user in users:
        results.append({
            'id': user.id,
            'username': user.username,
            'avatar_url': user.avatar(40) # Request a suitable avatar size
        })

    return jsonify(results)