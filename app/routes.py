# --- START OF FILE routes.py ---

# --- Imports ---
from flask import render_template, redirect, url_for, flash, request, session, jsonify, abort
from app import app, db
from app.forms import LoginForm, RegistrationForm, EditProfileForm, EmptyForm, PostForm, CreateGroupForm, MessageForm
from flask_login import current_user, login_user, logout_user, login_required
# Added InsightPanel and Text
from app.models import User, Group, GroupMember, Event, EventRSVP, Node, Post, Message, InvitedGuest, InsightPanel
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta # Added timedelta
from dateutil.parser import isoparse
from functools import wraps
from sqlalchemy.orm import aliased, joinedload
from sqlalchemy import func # Added func for aggregate functions like sum, count

# --- Helper Functions ---
# ... (Helper functions remain the same) ...
def is_group_member(user_id, group_id):
    return db.session.query(GroupMember.id).filter_by(user_id=user_id, group_id=group_id).first() is not None

def node_belongs_to_group(node_id, group_id):
    node = db.session.get(Node, node_id) # Use db.session.get for primary key lookup
    return node is not None and node.group_id == group_id

def require_group_member(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        group_id = kwargs.get('group_id')
        if group_id is None:
            abort(400, description="Missing group_id in route.")
        if not current_user.is_authenticated:
             abort(401) # Unauthorized if not logged in
        member_check = is_group_member(current_user.id, group_id)
        if not member_check:
             # Check if it's a public group or user has other permissions if needed
             abort(403, description="You are not authorized for this group.") # Forbidden
        return f(*args, **kwargs)
    return decorated_function

# --- Define Available Analysis Types ---
# MODIFIED: Changed preview_image_url to preview_image_filename and removed url_for() call
AVAILABLE_ANALYSES = {
    "spending-by-category": {
        "id": "spending-by-category",
        "title": "💸 Spending by Category",
        "description": "Total event costs grouped by the event's node (category).",

        # --- Structured data for the preview popup ---
        "preview_title": "Spending Example",
        "preview_image_filename": "img/placeholder-bar-chart.png", # JUST the filename relative to static folder
        "preview_description": "Shows total costs for events linked to different nodes. Helps track budget allocation.",

        # --- For the GRID PANEL's INITIAL LOADING STATE ONLY ---
        "placeholder_html": """
            <div class='loading-placeholder' style='text-align: center; padding: 20px; color: #aaa;'>
                <i class='fas fa-spinner fa-spin fa-2x'></i>
                <p style='margin-top: 10px;'>Loading spending data...</p>
            </div>
        """,

        "default_config": {"time_period": "all_time"}
    },
    # --- Example for another type ---
    # "attendance-trends": {
    #     "id": "attendance-trends",
    #     "title": "📈 Attendance Trends",
    #     "description": "Track event attendance over time.",
    #     "preview_title": "Attendance Example",
    #     "preview_image_filename": "img/placeholder-line-chart.png", # Example image filename
    #     "preview_description": "Visualizes RSVPs (Going) for past events.",
    #     "placeholder_html": "<div style='...'>Loading attendance data...</div>",
    #     "default_config": {"group_id": "all", "time_period": "last_6_months"}
    # },
}

# Helper to get details for an analysis type
def get_analysis_details(analysis_type_id):
    return AVAILABLE_ANALYSES.get(analysis_type_id)


# --- Basic Pages ---
# ... (Rest of the routes remain the same) ...

@app.before_request
def before_request():
    if current_user.is_authenticated:
        current_user.last_active = datetime.now(timezone.utc)
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
        user = db.session.scalar(db.select(User).filter_by(username=form.username.data))
        if user is None or not user.check_password(form.password.data):
            flash('Invalid username or password')
            return redirect(url_for('login'))
        login_user(user, remember=form.remember_me.data)
        next_page = request.args.get('next')
        if not next_page or urlparse(next_page).netloc != '' or urlparse(next_page).scheme != '':
             next_page = url_for('index')
        return redirect(next_page)
    return render_template('login.html', title='Sign In', form=form, hide_nav=True)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(username=form.username.data, email=form.email.data)
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash(f'Account created for {form.username.data}!', 'success')
        return redirect(url_for('login'))
    return render_template('register.html', title='Register', form=form, hide_nav=True)

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
    """Renders the main planner interface, including the Insights view."""
    user_panels = current_user.insight_panels
    user_groups = Group.query.join(GroupMember).filter(GroupMember.user_id == current_user.id).options(
         # Add options like load_only or joinedload if fetching related data
     ).order_by(Group.name).all()

    # Convert dict to list for Jinja looping - contains preview_image_filename now
    available_analyses_list = list(AVAILABLE_ANALYSES.values())

    is_mobile_on_load = 'Mobi' in request.headers.get('User-Agent', '')

    return render_template(
        'planner.html',
        title='Planner',
        groups=user_groups,
        is_mobile_on_load=is_mobile_on_load,
        available_analyses=available_analyses_list, # Pass the list with filenames
        user_panels=user_panels
    )

# ... (Rest of routes.py remains unchanged from the previous version) ...
# --- edit_profile, user, follow, unfollow, create_group, view_group, add_members ---
# --- send_message, messages, search_users ---
# --- API routes: get_groups, create_group_api, get_group_nodes, get_group_events_flat ---
# --- create_event_api, create_node_api, manage_event, manage_node ---
# --- _check_event_authorization, get_event_attendees, get_my_rsvp, update_my_rsvp ---
# --- api_search_users ---
# --- Insights Panel API routes: get_insight_panels, add_insight_panel, update_panel_order, delete_insight_panel ---
# --- get_analysis_data ---

@app.route('/edit_profile', methods=['GET', 'POST'])
@login_required
def edit_profile():
    form = EditProfileForm(current_user.username)
    if form.validate_on_submit():
        current_user.username = form.username.data
        current_user.about_me = form.about_me.data
        db.session.commit()
        flash('Your changes have been saved.')
        return redirect(url_for('profile'))
    elif request.method == 'GET':
        form.username.data = current_user.username
        form.about_me.data = current_user.about_me
    return render_template('edit_profile.html', title='Edit Profile', form=form)

@app.route('/user/<username>')
@login_required
def user(username):
    user = db.session.scalar(db.select(User).filter_by(username=username))
    if user is None:
        abort(404)

    page = request.args.get('page', 1, type=int)
    posts_query = db.select(Post).where(Post.user_id == user.id).order_by(Post.timestamp.desc())
    posts = db.paginate(posts_query, page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)

    form = EmptyForm()

    shared_groups = []
    if user != current_user:
        current_user_group_ids = {gm.group_id for gm in current_user.groups}
        target_user_group_ids = {gm.group_id for gm in user.groups}
        shared_group_ids = current_user_group_ids.intersection(target_user_group_ids)
        if shared_group_ids:
            shared_groups = db.session.scalars(
                db.select(Group).where(Group.id.in_(shared_group_ids)).order_by(Group.name)
            ).all()

    return render_template('user.html', user=user, posts=posts.items,
                           next_url=url_for('user', username=user.username, page=posts.next_num) if posts.has_next else None,
                           prev_url=url_for('user', username=user.username, page=posts.prev_num) if posts.has_prev else None,
                           form=form, groups=shared_groups)

@app.route('/follow/<username>', methods=['POST'])
@login_required
def follow(username):
    form = EmptyForm()
    if form.validate_on_submit():
        user = db.session.scalar(db.select(User).filter_by(username=username))
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
        user = db.session.scalar(db.select(User).filter_by(username=username))
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
        membership = GroupMember(user_id=current_user.id, group_id=group.id)
        db.session.add(membership)
        db.session.commit()
        flash("Group created successfully!", "success")
        return redirect(url_for("view_group", group_id=group.id))
    return render_template("create_group.html", title="Create Group", form=form)

@app.route("/groups/<int:group_id>", methods=["GET", "POST"])
@login_required
@require_group_member
def view_group(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        abort(404)

    form = PostForm()
    if form.validate_on_submit():
        post = Post(
            body=form.post.data,
            author=current_user,
            group_id=group_id,
            timestamp=datetime.now(timezone.utc)
        )
        db.session.add(post)
        db.session.commit()
        flash("Post created!")
        return redirect(url_for('view_group', group_id=group_id))

    page = request.args.get('page', 1, type=int)
    posts_query = db.select(Post).where(Post.group_id == group_id).order_by(Post.timestamp.desc())
    pagination = db.paginate(posts_query, page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)
    posts = pagination.items

    return render_template("view_group.html", group=group, posts=posts, form=form, pagination=pagination,
                           next_url=url_for('view_group', group_id=group.id, page=pagination.next_num) if pagination.has_next else None,
                           prev_url=url_for('view_group', group_id=group.id, page=pagination.prev_num) if pagination.has_prev else None)


@app.route("/group/<int:group_id>/add_members", methods=["GET", "POST"])
@login_required
@require_group_member
def add_members(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        abort(404)

    if request.method == 'POST':
        username_to_add = request.form.get('username')
        if not username_to_add:
            flash('Please enter a username.')
            return redirect(url_for('add_members', group_id=group_id))

        user_to_add = db.session.scalar(db.select(User).filter_by(username=username_to_add))

        if not user_to_add:
            flash(f'User "{username_to_add}" not found.')
            return redirect(url_for('add_members', group_id=group_id))

        existing_member = is_group_member(user_to_add.id, group_id)
        if existing_member:
            flash(f'{user_to_add.username} is already a group member.')
            return redirect(url_for('add_members', group_id=group_id))

        new_membership = GroupMember(user_id=user_to_add.id, group_id=group_id)
        db.session.add(new_membership)
        db.session.commit()

        flash(f'{user_to_add.username} has been added to the group!')
        return redirect(url_for('view_group', group_id=group_id))

    return render_template('add_members.html', title='Add Members', group=group)

# --- Messaging Routes ---

@app.route('/send_message/<recipient>', methods=['GET', 'POST'])
@login_required
def send_message(recipient):
    user = db.session.scalar(db.select(User).filter_by(username=recipient))
    if not user:
        abort(404)
    form = MessageForm()
    if form.validate_on_submit():
        msg = Message(sender_id=current_user.id, recipient_id=user.id, body=form.message.data)
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
    messages_query = db.select(Message)\
        .where(Message.recipient_id == current_user.id)\
        .order_by(Message.timestamp.desc())
    pagination = db.paginate(messages_query, page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)

    db.session.execute(messages_query.options(joinedload(Message.sender)))

    return render_template('messages.html', messages=pagination.items,
                           next_url=url_for('messages', page=pagination.next_num) if pagination.has_next else None,
                           prev_url=url_for('messages', page=pagination.prev_num) if pagination.has_prev else None)

# --- Search Route ---

@app.route('/search', methods=['GET'])
@login_required
def search_users():
    search_query = request.args.get('username', '').strip()
    users = []
    if search_query:
        users = db.session.scalars(
            db.select(User).filter(User.username.ilike(f'%{search_query}%')).limit(20)
        ).all()
    return render_template('search_users.html', title='Search Users', users=users, query=search_query)

# --- API Routes (SECURED) ---

@app.route("/api/groups", methods=["GET"])
@login_required
def get_groups():
    groups = current_user.groups.options(joinedload(GroupMember.group)).all()
    group_data = [gm.group.to_dict(include_nodes=False) for gm in groups if gm.group]
    return jsonify(group_data)

@app.route("/api/groups", methods=["POST"])
@login_required
def create_group_api():
    data = request.get_json() or {}
    name = data.get("name")
    if not name or not isinstance(name, str) or len(name.strip()) == 0:
        return jsonify({"error": "Group name is required and cannot be empty"}), 400

    group = Group(name=name.strip(),
                  avatar_url=data.get("avatar_url"),
                  about=data.get("about", ""))
    db.session.add(group)
    db.session.flush()

    membership = GroupMember(group_id=group.id, user_id=current_user.id)
    db.session.add(membership)
    db.session.commit()
    return jsonify(group.to_dict(include_nodes=False)), 201

@app.route("/api/groups/<int:group_id>/nodes", methods=["GET"])
@login_required
@require_group_member
def get_group_nodes(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        abort(404, description="Group not found")

    include_events_flag = request.args.get('include') == 'events'
    query = db.select(Node).where(Node.group_id == group_id)

    if include_events_flag:
        query = query.options(joinedload(Node.events))

    nodes = db.session.scalars(query).unique().all()

    nodes_data = []
    for node in nodes:
        node_dict = {
            "id": node.id,
            "label": node.label,
            "x": node.x,
            "y": node.y,
            "group_id": node.group_id,
            "events": []
        }
        if include_events_flag and node.events:
            node_dict["events"] = [
                event.to_dict(current_user_id=current_user.id) for event in node.events
            ]
        nodes_data.append(node_dict)

    return jsonify(nodes_data)

@app.route("/api/groups/<int:group_id>/events", methods=["GET"])
@login_required
@require_group_member
def get_group_events_flat(group_id):
    events_query = db.select(Event).join(Node).filter(Node.group_id == group_id).order_by(Event.date.desc())
    events = db.session.scalars(events_query).all()
    events_data = [event.to_dict(current_user_id=current_user.id) for event in events]
    return jsonify(events_data)


@app.route("/api/groups/<int:group_id>/events", methods=["POST"])
@login_required
@require_group_member
def create_event_api(group_id):
    data = request.get_json() or {}
    title = data.get("title", "Untitled Event").strip()
    location = data.get("location", "TBD").strip()
    iso_str = data.get("date")
    node_id = data.get("node_id")

    if not title:
         return jsonify({"error": "Event title cannot be empty"}), 400
    if not node_id:
        return jsonify({"error": "node_id is required to associate event with a category/node"}), 400

    if not node_belongs_to_group(node_id, group_id):
        return jsonify({"error": "Node does not belong to this group."}), 400

    try:
        event_date = isoparse(iso_str) if iso_str else datetime.now(timezone.utc)
        if event_date.tzinfo is None:
            event_date = event_date.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        event_date = datetime.now(timezone.utc)

    cost_display = data.get("cost_display", "Free")
    cost_value = None
    try:
        cost_input = data.get("cost_value")
        if cost_input is not None:
            cost_value = float(cost_input)
    except (ValueError, TypeError):
        cost_value = None

    event = Event(
        title=title,
        date=event_date,
        location=location,
        description=data.get("description", "").strip(),
        image_url=data.get("image_url"),
        cost_display=cost_display,
        cost_value=cost_value,
        node_id=node_id
    )
    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict(current_user_id=current_user.id)), 201


@app.route("/api/groups/<int:group_id>/nodes", methods=["POST"])
@login_required
@require_group_member
def create_node_api(group_id):
    data = request.get_json() or {}
    label = data.get("label", "Untitled Node").strip()
    if not label:
        return jsonify({"error": "Node label cannot be empty"}), 400

    try:
        x = float(data.get("x", 0))
        y = float(data.get("y", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid coordinates for node"}), 400

    node = Node(
        label=label,
        x=x,
        y=y,
        group_id=group_id
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict(include_events=False)), 201


@app.route("/api/events/<int:event_id>", methods=["GET", "PATCH", "DELETE"])
@login_required
def manage_event(event_id):
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    authorized = False
    group_id_for_event = None
    if event.node_id:
        node = db.session.get(Node, event.node_id)
        if node and node.group_id:
            group_id_for_event = node.group_id
            if is_group_member(current_user.id, group_id_for_event):
                authorized = True

    if not authorized and request.method != "GET": # Allow GET maybe? Requires auth check below
        # Add check here if non-members (e.g., invited) can GET
        return jsonify({"error": "Unauthorized action. Must be a member of the event's group."}), 403

    if request.method == "GET":
        # If broader GET access is needed, perform the check here
        # authorized_get, _, _ = _check_event_authorization(event_id, current_user.id)
        # if not authorized_get:
        #    return jsonify({"error": "Unauthorized to view this event."}), 403
        return jsonify(event.to_dict(current_user_id=current_user.id))

    if request.method == "PATCH":
        if not authorized: # Re-check specifically for PATCH
            return jsonify({"error": "Unauthorized action. Must be a member of the event's group."}), 403
        data = request.get_json() or {}
        updated = False
        if "title" in data and data["title"].strip():
            event.title = data["title"].strip(); updated = True
        if "location" in data:
            event.location = data["location"].strip(); updated = True
        if "description" in data:
            event.description = data["description"].strip(); updated = True
        if "date" in data:
            try:
                new_date = isoparse(data["date"])
                if new_date.tzinfo is None: new_date = new_date.replace(tzinfo=timezone.utc)
                event.date = new_date; updated = True
            except (ValueError, TypeError): pass
        if "cost_display" in data:
            event.cost_display = data["cost_display"]; updated = True
        if "cost_value" in data:
             try:
                 event.cost_value = float(data["cost_value"]) if data["cost_value"] is not None else None; updated = True
             except (ValueError, TypeError): pass
        if "node_id" in data and data["node_id"] != event.node_id:
             new_node_id = data["node_id"]
             if new_node_id is None or node_belongs_to_group(new_node_id, group_id_for_event):
                  event.node_id = new_node_id; updated = True
             else:
                  return jsonify({"error": "Cannot assign event to a node in a different group."}), 400

        if updated:
            db.session.commit()
        return jsonify(event.to_dict(current_user_id=current_user.id))

    if request.method == "DELETE":
        if not authorized: # Re-check specifically for DELETE
             return jsonify({"error": "Unauthorized action. Must be a member of the event's group."}), 403
        db.session.delete(event)
        db.session.commit()
        return jsonify({"success": True, "message": "Event deleted successfully."})

    return jsonify({"error": "Method not allowed"}), 405

@app.route("/api/nodes/<int:node_id>", methods=["GET", "PATCH", "DELETE"])
@login_required
def manage_node(node_id):
    node = db.session.get(Node, node_id)
    if not node:
        return jsonify({"error": "Node not found"}), 404

    if not is_group_member(current_user.id, node.group_id):
        return jsonify({"error": "Unauthorized. Must be a member of the node's group."}), 403

    if request.method == "GET":
        include_events = request.args.get('include') == 'events'
        return jsonify(node.to_dict(include_events=include_events))

    if request.method == "PATCH":
        data = request.get_json() or {}
        updated = False
        if "label" in data and data["label"].strip():
            node.label = data["label"].strip(); updated = True
        try:
            if "x" in data:
                node.x = float(data["x"]); updated = True
            if "y" in data:
                node.y = float(data["y"]); updated = True
        except (ValueError, TypeError):
             return jsonify({"error": "Invalid coordinates provided"}), 400

        if updated:
            db.session.commit()
        return jsonify(node.to_dict(include_events=False))

    if request.method == "DELETE":
        event_count = db.session.scalar(db.select(func.count(Event.id)).where(Event.node_id == node_id))
        if event_count > 0:
            return jsonify({"error": "Cannot delete node with associated events. Please reassign or delete events first."}), 400

        db.session.delete(node)
        db.session.commit()
        return jsonify({"success": True, "message": "Node deleted successfully."})

    return jsonify({"error": "Method not allowed"}), 405

# --- Event Modal & RSVP API Routes ---

def _check_event_authorization(event_id, user_id):
    event = db.session.get(Event, event_id)
    if not event:
        return False, "Event not found", 404

    user = db.session.get(User, user_id)
    if not user:
        return False, "User performing check not found", 404

    if event.node_id:
        node = db.session.get(Node, event.node_id)
        if node and node.group_id and is_group_member(user_id, node.group_id):
            return True, "Authorized as group member", 200

    is_invited = db.session.scalar(
        db.select(InvitedGuest.id).filter_by(event_id=event.id, email=user.email)
    )
    if is_invited:
        return True, "Authorized as invited guest", 200

    return False, "Not authorized for this event (not group member or invited guest).", 403

@app.route('/api/events/<int:event_id>/attendees', methods=['GET'])
@login_required
def get_event_attendees(event_id):
    authorized, message, status_code = _check_event_authorization(event_id, current_user.id)
    if not authorized:
        return jsonify({"error": message}), status_code

    rsvps_query = db.select(EventRSVP).options(joinedload(EventRSVP.user))\
                           .filter(EventRSVP.event_id == event_id)\
                           .filter(EventRSVP.status.isnot(None))\
                           .order_by(EventRSVP.timestamp.desc())

    rsvps = db.session.scalars(rsvps_query).all()

    attendees = []
    for rsvp in rsvps:
        if rsvp.user:
            attendees.append({
                'user_id': rsvp.user.id,
                'username': rsvp.user.username,
                'avatar_url': rsvp.user.avatar(40),
                'status': rsvp.status
            })

    return jsonify(attendees)

@app.route('/api/events/<int:event_id>/my-rsvp', methods=['GET'])
@login_required
def get_my_rsvp(event_id):
    authorized, message, status_code = _check_event_authorization(event_id, current_user.id)
    if not authorized:
        return jsonify({"error": message}), status_code

    rsvp = db.session.scalar(
        db.select(EventRSVP).filter_by(event_id=event_id, user_id=current_user.id)
    )
    status = rsvp.status if rsvp else None
    return jsonify({"status": status})


@app.route('/api/events/<int:event_id>/rsvp', methods=['POST'])
@login_required
def update_my_rsvp(event_id):
    authorized, message, status_code = _check_event_authorization(event_id, current_user.id)
    if not authorized:
        return jsonify({"error": message}), status_code

    data = request.get_json()
    if not data or 'status' not in data:
        return jsonify({"error": "Missing 'status' in request body"}), 400

    new_status = data['status']
    allowed_statuses = ['attending', 'maybe', 'declined', None]
    if new_status not in allowed_statuses:
        if isinstance(new_status, str) and new_status.lower() == 'none':
            new_status = None
        else:
            return jsonify({"error": f"Invalid status: '{new_status}'. Allowed: {allowed_statuses}"}), 400

    rsvp = db.session.scalar(
        db.select(EventRSVP).filter_by(event_id=event_id, user_id=current_user.id)
    )

    if new_status is None:
        if rsvp:
            db.session.delete(rsvp)
            db.session.commit()
            return jsonify({"message": "RSVP cleared successfully.", "status": None})
        else:
            return jsonify({"message": "No existing RSVP to clear.", "status": None})
    else:
        if rsvp:
            if rsvp.status != new_status:
                rsvp.status = new_status
                rsvp.timestamp = datetime.now(timezone.utc)
                db.session.commit()
                return jsonify({"message": f"RSVP updated to '{new_status}'.", "status": new_status})
            else:
                 return jsonify({"message": f"RSVP already set to '{new_status}'.", "status": new_status})
        else:
            new_rsvp = EventRSVP(
                event_id=event_id,
                user_id=current_user.id,
                status=new_status,
                timestamp=datetime.now(timezone.utc)
            )
            db.session.add(new_rsvp)
            db.session.commit()
            return jsonify({"message": f"RSVP successfully set to '{new_status}'.", "status": new_status}), 201

# --- API Search Users ---
@app.route('/api/search/users', methods=['GET'])
@login_required
def api_search_users():
    query = request.args.get('q', '').strip()
    limit = request.args.get('limit', 10, type=int)

    if not query:
        return jsonify([])

    users_query = db.select(User).filter(
            User.username.ilike(f'%{query}%'),
            User.id != current_user.id
        ).limit(limit)

    users = db.session.scalars(users_query).all()

    results = [{
        'id': user.id,
        'username': user.username,
        'avatar_url': user.avatar(40)
    } for user in users]

    return jsonify(results)


# --- Insights Panel API Routes ---

@app.route('/api/insights/panels', methods=['GET'])
@login_required
def get_insight_panels():
    panels = current_user.insight_panels
    return jsonify([panel.to_dict() for panel in panels])

@app.route('/api/insights/panels', methods=['POST'])
@login_required
def add_insight_panel():
    data = request.get_json()
    if not data or 'analysis_type' not in data:
        return jsonify({"error": "Missing 'analysis_type' in request body"}), 400

    analysis_type = data['analysis_type']
    details = get_analysis_details(analysis_type)

    if not details:
        return jsonify({"error": f"Invalid analysis type: {analysis_type}"}), 400

    max_order = db.session.scalar(
        db.select(func.max(InsightPanel.display_order)).where(InsightPanel.user_id == current_user.id)
    )
    next_order = (max_order + 1) if max_order is not None else 0

    new_panel = InsightPanel(
        user_id=current_user.id,
        analysis_type=analysis_type,
        title=details['title'],
        description=details['description'],
        display_order=next_order,
        configuration=data.get('configuration', details.get('default_config'))
    )
    db.session.add(new_panel)
    db.session.commit()
    return jsonify(new_panel.to_dict()), 201


@app.route('/api/insights/panels/order', methods=['PUT'])
@login_required
def update_panel_order():
    data = request.get_json()
    if not data or 'panel_ids' not in data or not isinstance(data['panel_ids'], list):
        return jsonify({"error": "Missing or invalid 'panel_ids' list in request body"}), 400

    panel_ids_ordered = data['panel_ids']
    user_panels = {panel.id: panel for panel in current_user.insight_panels}

    updated_count = 0
    for index, panel_id_str in enumerate(panel_ids_ordered):
        try:
            panel_id = int(panel_id_str) # Convert ID from JSON string/number to int
            if panel_id in user_panels:
                panel = user_panels[panel_id]
                if panel.display_order != index:
                    panel.display_order = index
                    updated_count += 1
            else:
                app.logger.warning(f"User {current_user.id} attempted to reorder panel {panel_id} which they don't own.")
        except (ValueError, TypeError):
             app.logger.warning(f"User {current_user.id} sent invalid panel ID '{panel_id_str}' in reorder request.")


    if updated_count > 0:
        db.session.commit()

    updated_panels = db.session.scalars(
        db.select(InsightPanel).where(InsightPanel.user_id == current_user.id).order_by(InsightPanel.display_order)
    ).all()
    return jsonify([panel.to_dict() for panel in updated_panels])


@app.route('/api/insights/panels/<int:panel_id>', methods=['DELETE'])
@login_required
def delete_insight_panel(panel_id):
    panel = db.session.get(InsightPanel, panel_id)

    if not panel:
        return jsonify({"error": "Panel not found"}), 404

    if panel.user_id != current_user.id:
        return jsonify({"error": "Unauthorized to delete this panel"}), 403

    db.session.delete(panel)
    db.session.commit()
    return jsonify({"success": True, "message": "Panel deleted successfully."})

# --- Analysis Data Endpoint (Example: Spending) ---

@app.route('/api/analysis/data/<analysis_type>', methods=['GET'])
@login_required
def get_analysis_data(analysis_type):
    panel_id = request.args.get('panel_id', type=int)
    panel = None
    config = {}

    if panel_id:
        panel = db.session.get(InsightPanel, panel_id)
        if panel and panel.user_id == current_user.id:
            config = panel.configuration or {}
        else:
             details = get_analysis_details(analysis_type)
             config = details.get('default_config', {}) if details else {}
    else:
         details = get_analysis_details(analysis_type)
         config = details.get('default_config', {}) if details else {}

    if analysis_type == 'spending-by-category':
        time_period = config.get('time_period', 'all_time')
        start_date = None
        if time_period == 'last_month':
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        elif time_period == 'last_year':
            start_date = datetime.now(timezone.utc) - timedelta(days=365)

        query = db.session.query(
                Node.label.label('category'),
                func.sum(Event.cost_value).label('total_cost')
            ).join(Event, Node.id == Event.node_id)\
            .join(Group, Node.group_id == Group.id)\
            .join(GroupMember, Group.id == GroupMember.group_id)\
            .filter(GroupMember.user_id == current_user.id)\
            .filter(Event.cost_value.isnot(None))\
            .filter(Event.cost_value > 0)

        if start_date:
            query = query.filter(Event.date >= start_date)

        query = query.group_by(Node.label).order_by(func.sum(Event.cost_value).desc())
        results = query.all()

        analysis_data = [
            {"category": row.category, "amount": round(row.total_cost, 2)} for row in results
        ]
        response_data = {
            "analysis_type": analysis_type,
            "title": f"Spending by Category ({time_period.replace('_', ' ').title()})",
            "data": analysis_data,
            "config": config
        }
        return jsonify(response_data)

    # --- Add logic for other analysis types here ---
    # elif analysis_type == 'attendance-trends':
    #    ... fetch attendance data ...
    #    return jsonify(...)

    else:
        return jsonify({"error": f"Analysis type '{analysis_type}' not implemented."}), 404

# --- END OF FILE routes.py ---