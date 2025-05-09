# --- START OF FILE routes.py ---

from flask import render_template, redirect, url_for, flash, request, session, jsonify, abort
from app import app, db
from app.forms import LoginForm, RegistrationForm, EditProfileForm, EmptyForm, PostForm, CreateGroupForm, MessageForm
from flask_login import current_user, login_user, logout_user, login_required
from app.models import User, Group, GroupMember, Event, EventRSVP, Node, Post, Message, InvitedGuest, FriendRequest, InsightPanel
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from dateutil.parser import isoparse
from functools import wraps
from sqlalchemy.orm import aliased, joinedload
from sqlalchemy import func, text, or_

# ... (Helper Functions: is_group_member, node_belongs_to_group, require_group_member) ...
def is_group_member(user_id, group_id):
    return db.session.query(GroupMember.id).filter_by(user_id=user_id, group_id=group_id).first() is not None

def node_belongs_to_group(node_id, group_id):
    node = db.session.get(Node, node_id)
    return node is not None and node.group_id == group_id

def require_group_member(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        group_id = kwargs.get('group_id')
        if group_id is None:
            abort(400, description="Missing group_id in route.")
        if not current_user.is_authenticated:
             abort(401)
        member_check = is_group_member(current_user.id, group_id)
        if not member_check:
             abort(403, description="You are not authorized for this group.")
        return f(*args, **kwargs)
    return decorated_function

# --- Define Available Analysis Types ---
AVAILABLE_ANALYSES = {
    "spending-by-category": {
        "id": "spending-by-category",
        "title": "💸 Spending by Category",
        "description": "Total event costs grouped by the event's node (category). Can be filtered by group.", # MODIFIED description
        "preview_title": "Spending Example",
        "preview_image_filename": "img/placeholder-bar-chart.png",
        "preview_description": "Shows total costs for events linked to different nodes. Helps track budget allocation.",
        "placeholder_html": """
            <div class='loading-placeholder' style='text-align: center; padding: 20px; color: #aaa;'>
                <i class='fas fa-spinner fa-spin fa-2x'></i>
                <p style='margin-top: 10px;'>Loading spending data...</p>
            </div>
        """,
        "default_config": {"time_period": "all_time", "group_id": "all"} # ADDED group_id: "all"
    },
    # ... (other analysis types if any) ...
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
    groups = Group.query.join(GroupMember).filter(GroupMember.user_id == current_user.id).all()

    return render_template('index.html', title='Home', form=form,
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

@app.route('/friends', methods=['GET'])
@login_required
def friends():
    # Get the current user's friends
    friends = current_user.friends.all()  # Use `.all()` if the relationship is lazy="dynamic"

    # Get pending friend requests (assuming a FriendRequest model exists)
    friend_requests = FriendRequest.query.filter_by(receiver_id=current_user.id).all()

    return render_template('friends.html', friends=friends, friend_requests=friend_requests)


@app.route('/search_friends', methods=['GET'])
@login_required
def search_friends():
    query = request.args.get('query', '').strip()
    search_results = []

    if query:
        # Perform a fuzzy search for usernames containing the query (case-insensitive)
        search_results = User.query.filter(
            or_(
                User.username.ilike(f'%{query}%'),  # Case-insensitive partial match
                User.email.ilike(f'%{query}%')     # Optionally allow searching by email
            )
        ).all()

    # Exclude the current user from the search results
    search_results = [user for user in search_results if user.id != current_user.id]
    
    # Exclude users who are already friends with the current user
    search_results = [user for user in search_results if not current_user.is_friend(user)]

    # Get a list of users to whom the current user has already sent friend requests
    sent_requests = {req.receiver_id for req in FriendRequest.query.filter_by(sender_id=current_user.id).all()}

    # Get users who have sent friend requests to the current user
    received_requests = {req.sender_id: req.id for req in FriendRequest.query.filter_by(receiver_id=current_user.id).all()}

    # Also get the pending friend requests
    friend_requests = FriendRequest.query.filter_by(receiver_id=current_user.id).all()

    # Render the friends page with search results, sent requests, and friend requests
    friends = current_user.friends.all()
    return render_template('friends.html', 
                          friends=friends, 
                          search_results=search_results, 
                          sent_requests=sent_requests,
                          received_requests=received_requests,
                          friend_requests=friend_requests)

@app.route('/handle_friend_request', methods=['POST'])
@login_required
def handle_friend_request():
    request_id = request.form.get('request_id')
    action = request.form.get('action')

    # Fetch the friend request
    friend_request = FriendRequest.query.get(request_id)
    if not friend_request or friend_request.receiver_id != current_user.id:
        flash('Invalid friend request.', 'danger')
        return redirect(url_for('friends'))

    if action == 'accept':
        # Add the sender as a friend
        current_user.add_friend(friend_request.sender)
        db.session.delete(friend_request)  # Remove the friend request
        db.session.commit()
        flash(f'You are now friends with {friend_request.sender.username}!', 'success')
    elif action == 'reject':
        # Reject the friend request
        db.session.delete(friend_request)
        db.session.commit()
        flash('Friend request rejected.', 'info')

    return redirect(url_for('friends'))

@app.route('/add_friend', methods=['POST'])
@login_required
def add_friend():
    friend_id = request.form.get('friend_id')
    if not friend_id:
        flash('Invalid friend request.', 'danger')
        return redirect(url_for('friends'))

    # Find the user by ID
    friend = User.query.get(friend_id)
    if not friend:
        flash('User not found.', 'danger')
        return redirect(url_for('friends'))

    # Add the friend
    if current_user.is_friend(friend):
        flash(f'{friend.username} is already your friend.', 'info')
    else:
        current_user.add_friend(friend)
        db.session.commit()
        flash(f'{friend.username} has been added to your friends list!', 'success')

    return redirect(url_for('friends'))

@app.route('/remove_friend', methods=['POST'])
@login_required
def remove_friend():
    friend_id = request.form.get('friend_id')
    if not friend_id:
        flash('Invalid friend ID.', 'danger')
        return redirect(url_for('friends'))

    # Find the user by ID
    friend = User.query.get(friend_id)
    if not friend:
        flash('User not found.', 'danger')
        return redirect(url_for('friends'))

    # Remove the friend
    if current_user.is_friend(friend):
        current_user.remove_friend(friend)
        db.session.commit()
        flash(f'{friend.username} has been removed from your friends list.', 'success')
    else:
        flash(f'{friend.username} is not in your friends list.', 'info')

    return redirect(url_for('friends'))

@app.route('/send_friend_request', methods=['POST'])
@login_required
def send_friend_request():
    receiver_username = request.form.get('receiver_username')
    if not receiver_username:
        flash('Please provide a username.', 'danger')
        return redirect(url_for('friends'))

    receiver = User.query.filter_by(username=receiver_username).first()
    if not receiver:
        flash('User not found.', 'danger')
        return redirect(url_for('friends'))

    if current_user.is_friend(receiver):
        flash(f'{receiver.username} is already your friend.', 'info')
    elif FriendRequest.query.filter_by(sender_id=current_user.id, receiver_id=receiver.id).first():
        flash(f'You have already sent a friend request to {receiver.username}.', 'info')
    else:
        friend_request = FriendRequest(sender=current_user, receiver=receiver)
        db.session.add(friend_request)
        db.session.commit()
        flash(f'Friend request sent to {receiver.username}!', 'success')

    return redirect(url_for('friends'))

@app.route('/planner')
@login_required
def planner():
    """Renders the main planner interface, including the Insights view."""
    user_panels_query = db.select(InsightPanel)\
        .where(InsightPanel.user_id == current_user.id)\
        .order_by(InsightPanel.display_order)
    user_panels = db.session.scalars(user_panels_query).all()

    user_groups = Group.query.join(GroupMember).filter(GroupMember.user_id == current_user.id).options(
         # Add options like load_only or joinedload if fetching related data
     ).order_by(Group.name).all()

    available_analyses_list = list(AVAILABLE_ANALYSES.values())
    is_mobile_on_load = 'Mobi' in request.headers.get('User-Agent', '')

    return render_template(
        'planner.html',
        title='Planner',
        groups=user_groups, # For configuring panels - frontend needs to populate group dropdown
        is_mobile_on_load=is_mobile_on_load,
        available_analyses=available_analyses_list,
        user_panels=user_panels
    )

# ... (Rest of routes.py: edit_profile, user, follow, unfollow, group routes, message routes, search, API routes up to Insights Panel API) ...
@app.route('/edit_profile', methods=['GET', 'POST'])
@login_required
def edit_profile():
    form = EditProfileForm(current_user.username)
    if form.validate_on_submit():
        current_user.username = form.username.data
        current_user.about_me = form.about_me.data
        db.session.commit()
        flash('Your changes have been saved.', 'success')
        return redirect(url_for('user', username=current_user.username)) 
    elif request.method == 'GET':
        form.username.data = current_user.username
        form.about_me.data = current_user.about_me
    return render_template('edit_profile.html', title='Edit Profile', form=form)


@app.route('/user/<username>')
@login_required
def user(username):
    user_obj = db.session.scalar(db.select(User).filter_by(username=username)) # Renamed to user_obj to avoid conflict
    if user_obj is None:
        abort(404)

    page = request.args.get('page', 1, type=int)
    posts_query = db.select(Post).where(Post.user_id == user_obj.id).order_by(Post.timestamp.desc())
    posts_pagination = db.paginate(posts_query, page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)

    form = EmptyForm()

    shared_groups = []
    if user_obj != current_user:
        current_user_group_ids = {gm.group_id for gm in current_user.groups}
        target_user_group_ids = {gm.group_id for gm in user_obj.groups} # Use user_obj
        shared_group_ids = current_user_group_ids.intersection(target_user_group_ids)
        if shared_group_ids:
            shared_groups = db.session.scalars(
                db.select(Group).where(Group.id.in_(shared_group_ids)).order_by(Group.name)
            ).all()

    return render_template('user.html', user=user_obj, posts=posts_pagination.items, # Use user_obj
                           next_url=url_for('user', username=user_obj.username, page=posts_pagination.next_num) if posts_pagination.has_next else None,
                           prev_url=url_for('user', username=user_obj.username, page=posts_pagination.prev_num) if posts_pagination.has_prev else None,
                           form=form, groups=shared_groups) # groups here refers to shared_groups


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
    posts_query = db.select(Post).where(Post.group_id == group_id).order_by(Post.timestamp.asc())
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

    # Get all the current user's friends
    friends = current_user.friends.all()
    
    if request.method == 'POST':
        username_to_add = request.form.get('username')
        if not username_to_add:
            flash('Please enter a username.')
            return redirect(url_for('add_members', group_id=group_id))

        user_to_add = db.session.scalar(db.select(User).filter_by(username=username_to_add))

        if not user_to_add:
            flash(f'User "{username_to_add}" not found.')
            return redirect(url_for('add_members', group_id=group_id))

        # Check if user is already a member
        existing_member = is_group_member(user_to_add.id, group_id)
        if existing_member:
            flash(f'{user_to_add.username} is already a group member.')
            return redirect(url_for('add_members', group_id=group_id))

        # Check for mutual follow
        is_friends = current_user.is_friend(user_to_add)
        if not is_friends:
            flash(f"You need to be friends with {user_to_add.username} before adding them to the group.")
            return redirect(url_for('add_members', group_id=group_id))

        # Add the user to the group
        new_membership = GroupMember(user_id=user_to_add.id, group_id=group_id)
        db.session.add(new_membership)
        db.session.commit()

        flash(f'{user_to_add.username} has been added to the group!')
        return redirect(url_for('view_group', group_id=group_id))

    # For GET request, render template with friends list
    # Filter to only show friends who aren't already in the group and have mutual follow
    eligible_friends = []
    for friend in friends:
        if not is_group_member(friend.id, group_id):
            eligible_friends.append(friend)

    return render_template('add_members.html', 
                          title='Add Members', 
                          group=group, 
                          friends=eligible_friends)

@app.route('/send_message/<recipient_username>', methods=['GET', 'POST']) # Changed param name
@login_required
def send_message(recipient_username): # Changed param name
    user_recipient = db.session.scalar(db.select(User).filter_by(username=recipient_username)) # Use new param name
    if not user_recipient:
        abort(404)
    form = MessageForm()
    if form.validate_on_submit():
        msg = Message(sender_id=current_user.id, recipient_id=user_recipient.id, body=form.message.data)
        db.session.add(msg)
        db.session.commit()
        flash('Your message has been sent.')
        return redirect(url_for('user', username=recipient_username)) # Use new param name
    return render_template('send_message.html', title='Send Message', form=form, recipient=recipient_username) # Use new param name

@app.route('/messages')
@login_required
def messages():
    current_user.last_message_read_time = datetime.now(timezone.utc)
    db.session.commit()

    page = request.args.get('page', 1, type=int)
    messages_query = db.select(Message)\
        .where(Message.recipient_id == current_user.id)\
        .options(joinedload(Message.sender))\
        .order_by(Message.timestamp.desc())
    pagination = db.paginate(messages_query, page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)
    
    # The joinedload should handle eager loading, so explicit execute before render might not be needed for sender.
    # db.session.execute(messages_query.options(joinedload(Message.sender))) # This line might be redundant if pagination executes query

    return render_template('messages.html', messages=pagination.items,
                           next_url=url_for('messages', page=pagination.next_num) if pagination.has_next else None,
                           prev_url=url_for('messages', page=pagination.prev_num) if pagination.has_prev else None)

@app.route('/search', methods=['GET'])
@login_required
def search_users():
    search_query = request.args.get('username', '').strip()
    users_list = [] # Renamed to avoid conflict
    if search_query:
        users_list = db.session.scalars(
            db.select(User).filter(User.username.ilike(f'%{search_query}%')).limit(20)
        ).all()
    return render_template('search_users.html', title='Search Users', users=users_list, query=search_query) # Use users_list


@app.route("/api/groups", methods=["GET"])
@login_required
def get_groups():
    # Correctly fetch groups the user is a member of
    groups_query = db.select(Group).join(GroupMember).filter(GroupMember.user_id == current_user.id)
    user_groups = db.session.scalars(groups_query).all()
    group_data = [g.to_dict(include_nodes=False) for g in user_groups]
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
        query = query.options(joinedload(Node.events).joinedload(Event.attendees).joinedload(EventRSVP.user)) # Example of deeper load

    nodes = db.session.scalars(query).unique().all() # .unique() if joinedload might cause duplicates

    nodes_data = []
    for node_item in nodes: # Renamed to avoid conflict
        node_dict = {
            "id": node_item.id,
            "label": node_item.label,
            "x": node_item.x,
            "y": node_item.y,
            "group_id": node_item.group_id,
            "events": []
        }
        if include_events_flag and node_item.events:
            node_dict["events"] = [
                event.to_dict(current_user_id=current_user.id) for event in node_item.events
            ]
        nodes_data.append(node_dict)

    return jsonify(nodes_data)

@app.route("/api/groups/<int:group_id>/events", methods=["GET"])
@login_required
@require_group_member
def get_group_events_flat(group_id):
    events_query = db.select(Event).join(Node).filter(Node.group_id == group_id).order_by(Event.date.desc())
    events_list = db.session.scalars(events_query).all() # Renamed
    events_data = [event.to_dict(current_user_id=current_user.id) for event in events_list]
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
        if cost_input is not None and str(cost_input).strip() != "": # Check for non-empty string too
            cost_value = float(cost_input)
    except (ValueError, TypeError):
        cost_value = None # Explicitly set to None if conversion fails

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
        x_coord = float(data.get("x", 0)) # Renamed
        y_coord = float(data.get("y", 0)) # Renamed
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid coordinates for node"}), 400

    node_obj = Node( # Renamed
        label=label,
        x=x_coord,
        y=y_coord,
        group_id=group_id
    )
    db.session.add(node_obj)
    db.session.commit()
    return jsonify(node_obj.to_dict(include_events=False)), 201


@app.route("/api/events/<int:event_id>", methods=["GET", "PATCH", "DELETE"])
@login_required
def manage_event(event_id):
    event_obj = db.session.get(Event, event_id) # Renamed
    if not event_obj:
        return jsonify({"error": "Event not found"}), 404

    authorized = False
    group_id_for_event = None
    if event_obj.node_id:
        node_of_event = db.session.get(Node, event_obj.node_id) # Renamed
        if node_of_event and node_of_event.group_id:
            group_id_for_event = node_of_event.group_id
            if is_group_member(current_user.id, group_id_for_event):
                authorized = True
    
    if not authorized and request.method != "GET":
        return jsonify({"error": "Unauthorized action. Must be a member of the event's group."}), 403

    if request.method == "GET":
        # For GET, broader authorization might be needed (e.g. invited guest)
        # For now, assume only group members can GET if they are authorized for other methods.
        # If you need _check_event_authorization here, uncomment and use it.
        # authorized_get, _, _ = _check_event_authorization(event_id, current_user.id)
        # if not authorized_get:
        #    return jsonify({"error": "Unauthorized to view this event."}), 403
        if not authorized: # Stricter GET for now, align with PATCH/DELETE
             return jsonify({"error": "Unauthorized to view this event. Must be group member."}), 403
        return jsonify(event_obj.to_dict(current_user_id=current_user.id))

    if request.method == "PATCH":
        if not authorized:
            return jsonify({"error": "Unauthorized action. Must be a member of the event's group."}), 403
        data = request.get_json() or {}
        updated = False
        if "title" in data and data["title"].strip():
            event_obj.title = data["title"].strip(); updated = True
        if "location" in data:
            event_obj.location = data["location"].strip(); updated = True
        if "description" in data:
            event_obj.description = data["description"].strip(); updated = True
        if "date" in data:
            try:
                new_date = isoparse(data["date"])
                if new_date.tzinfo is None: new_date = new_date.replace(tzinfo=timezone.utc)
                event_obj.date = new_date; updated = True
            except (ValueError, TypeError): pass
        if "cost_display" in data:
            event_obj.cost_display = data["cost_display"]; updated = True
        if "cost_value" in data:
             try:
                 event_obj.cost_value = float(data["cost_value"]) if data["cost_value"] is not None and str(data["cost_value"]).strip() != "" else None; updated = True
             except (ValueError, TypeError): pass # Keep old value if conversion fails
        if "node_id" in data and data["node_id"] != event_obj.node_id:
             new_node_id = data["node_id"]
             if new_node_id is None or node_belongs_to_group(new_node_id, group_id_for_event):
                  event_obj.node_id = new_node_id; updated = True
             else:
                  return jsonify({"error": "Cannot assign event to a node in a different group."}), 400

        if updated:
            db.session.commit()
        return jsonify(event_obj.to_dict(current_user_id=current_user.id))

    if request.method == "DELETE":
        if not authorized:
             return jsonify({"error": "Unauthorized action. Must be a member of the event's group."}), 403
        db.session.delete(event_obj)
        db.session.commit()
        return jsonify({"success": True, "message": "Event deleted successfully."})

    return jsonify({"error": "Method not allowed"}), 405

@app.route("/api/nodes/<int:node_id>", methods=["GET", "PATCH", "DELETE"])
@login_required
def manage_node(node_id):
    node_obj = db.session.get(Node, node_id) # Renamed
    if not node_obj:
        return jsonify({"error": "Node not found"}), 404

    if not is_group_member(current_user.id, node_obj.group_id):
        return jsonify({"error": "Unauthorized. Must be a member of the node's group."}), 403

    if request.method == "GET":
        include_events = request.args.get('include') == 'events'
        return jsonify(node_obj.to_dict(include_events=include_events))

    if request.method == "PATCH":
        data = request.get_json() or {}
        updated = False
        if "label" in data and data["label"].strip():
            node_obj.label = data["label"].strip(); updated = True
        try:
            if "x" in data:
                node_obj.x = float(data["x"]); updated = True
            if "y" in data:
                node_obj.y = float(data["y"]); updated = True
        except (ValueError, TypeError):
             return jsonify({"error": "Invalid coordinates provided"}), 400

        if updated:
            db.session.commit()
        return jsonify(node_obj.to_dict(include_events=False))

    if request.method == "DELETE":
        event_count = db.session.scalar(db.select(func.count(Event.id)).where(Event.node_id == node_id))
        if event_count > 0:
            return jsonify({"error": "Cannot delete node with associated events. Please reassign or delete events first."}), 400

        db.session.delete(node_obj)
        db.session.commit()
        return jsonify({"success": True, "message": "Node deleted successfully."})

    return jsonify({"error": "Method not allowed"}), 405

def _check_event_authorization(event_id, user_id_to_check): # Renamed parameter
    event_to_check = db.session.get(Event, event_id) # Renamed
    if not event_to_check:
        return False, "Event not found", 404

    user_checking = db.session.get(User, user_id_to_check) # Renamed
    if not user_checking:
        return False, "User performing check not found", 404

    if event_to_check.node_id:
        node_of_event = db.session.get(Node, event_to_check.node_id) # Renamed
        if node_of_event and node_of_event.group_id and is_group_member(user_id_to_check, node_of_event.group_id):
            return True, "Authorized as group member", 200

    is_invited = db.session.scalar(
        db.select(InvitedGuest.id).filter_by(event_id=event_to_check.id, email=user_checking.email)
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
        if rsvp.user: # Ensure user exists
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
    allowed_statuses = ['attending', 'maybe', 'declined', None] # None will clear RSVP
    
    # Normalize 'none' string to None type
    if isinstance(new_status, str) and new_status.lower() == 'none':
        new_status = None
        
    if new_status not in allowed_statuses:
        return jsonify({"error": f"Invalid status: '{new_status}'. Allowed: {allowed_statuses}"}), 400

    rsvp = db.session.scalar(
        db.select(EventRSVP).filter_by(event_id=event_id, user_id=current_user.id)
    )

    if new_status is None: # Clear RSVP
        if rsvp:
            db.session.delete(rsvp)
            db.session.commit()
            return jsonify({"message": "RSVP cleared successfully.", "status": None})
        else:
            return jsonify({"message": "No existing RSVP to clear.", "status": None}) # Not an error
    else: # Set or update RSVP
        if rsvp:
            if rsvp.status != new_status:
                rsvp.status = new_status
                rsvp.timestamp = datetime.now(timezone.utc)
                db.session.commit()
                return jsonify({"message": f"RSVP updated to '{new_status}'.", "status": new_status})
            else: # No change
                 return jsonify({"message": f"RSVP already set to '{new_status}'.", "status": new_status})
        else: # New RSVP
            new_rsvp = EventRSVP(
                event_id=event_id,
                user_id=current_user.id,
                status=new_status,
                timestamp=datetime.now(timezone.utc)
            )
            db.session.add(new_rsvp)
            db.session.commit()
            return jsonify({"message": f"RSVP successfully set to '{new_status}'.", "status": new_status}), 201

@app.route('/api/search/users', methods=['GET'])
@login_required
def api_search_users():
    query_param = request.args.get('q', '').strip() # Renamed
    limit = request.args.get('limit', 10, type=int)

    if not query_param:
        return jsonify([])

    users_query = db.select(User).filter(
            User.username.ilike(f'%{query_param}%'),
            User.id != current_user.id # Exclude current user from results
        ).limit(limit)

    found_users = db.session.scalars(users_query).all() # Renamed

    results = [{
        'id': u.id, # Renamed loop var
        'username': u.username,
        'avatar_url': u.avatar(40)
    } for u in found_users]

    return jsonify(results)

# --- Insights Panel API Routes ---

@app.route('/api/insights/panels', methods=['GET'])
@login_required
def get_insight_panels():
    panels_query = db.select(InsightPanel)\
        .where(InsightPanel.user_id == current_user.id)\
        .order_by(InsightPanel.display_order)
    panels = db.session.scalars(panels_query).all()
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

    max_order_val = db.session.scalar( # Renamed
        db.select(func.max(InsightPanel.display_order)).where(InsightPanel.user_id == current_user.id)
    )
    next_order = (max_order_val + 1) if max_order_val is not None else 0
    
    # Configuration: Start with default, then override with any provided in request
    panel_config = details.get('default_config', {}).copy()
    if 'configuration' in data and isinstance(data['configuration'], dict):
        panel_config.update(data['configuration'])


    new_panel = InsightPanel(
        user_id=current_user.id,
        analysis_type=analysis_type,
        title=details['title'], # This is the generic title; actual data might have a more specific one
        description=details['description'],
        display_order=next_order,
        configuration=panel_config # Use merged config
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
    
    # Fetch all user's panels to update them in one go
    user_panels_list = db.session.scalars( # Renamed
        db.select(InsightPanel).where(InsightPanel.user_id == current_user.id)
    ).all()
    user_panels_map = {panel.id: panel for panel in user_panels_list}


    updated_count = 0
    for index, panel_id_str in enumerate(panel_ids_ordered):
        try:
            panel_id = int(panel_id_str)
            if panel_id in user_panels_map:
                panel = user_panels_map[panel_id]
                if panel.display_order != index:
                    panel.display_order = index
                    updated_count += 1
            else:
                app.logger.warning(f"User {current_user.id} attempted to reorder panel {panel_id} which they don't own or doesn't exist.")
        except (ValueError, TypeError):
             app.logger.warning(f"User {current_user.id} sent invalid panel ID '{panel_id_str}' in reorder request.")

    if updated_count > 0:
        db.session.commit()

    # Return the freshly ordered list
    ordered_panels_query = db.select(InsightPanel)\
        .where(InsightPanel.user_id == current_user.id)\
        .order_by(InsightPanel.display_order)
    updated_panels = db.session.scalars(ordered_panels_query).all()
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
# MODIFIED to handle group filtering and use SQLAlchemy 2.0 style
# In routes.py

# ... (other imports and existing code up to get_analysis_data) ...

@app.route('/api/analysis/data/<analysis_type>', methods=['GET'])
@login_required
def get_analysis_data(analysis_type):
    panel_id = request.args.get('panel_id', type=int)
    panel = None
    config = {}
    user = current_user # For clarity

    # ... (config handling for panel_id, analysis_type, time_period, group_id_filter - same as before) ...
    if panel_id:
        panel = db.session.get(InsightPanel, panel_id)

    if panel and panel.user_id == user.id and panel.analysis_type == analysis_type:
        config = panel.configuration or {}
    else:
        analysis_details = get_analysis_details(analysis_type)
        config = analysis_details.get('default_config', {}).copy() if analysis_details else {}

    if analysis_type == 'spending-by-category':
        time_period = config.get('time_period', 'all_time')
        raw_group_id_filter = config.get('group_id', 'all')
        
        group_id_to_filter = 'all' # This will be an integer group ID or the string 'all'
        specific_group_name_for_title = None

        if raw_group_id_filter != 'all':
            try:
                gid_int = int(raw_group_id_filter)
                group_for_filter = db.session.get(Group, gid_int)
                # User must be a member of the group they want to filter by
                if group_for_filter and is_group_member(user.id, gid_int):
                    group_id_to_filter = gid_int
                    specific_group_name_for_title = group_for_filter.name
                else:
                    app.logger.warning(f"User {user.id} tried to filter spending by group {gid_int} they are not a member of. Defaulting to 'all'.")
                    # Keep group_id_to_filter as 'all'
            except ValueError:
                app.logger.warning(f"Invalid group_id '{raw_group_id_filter}' in spending config. Defaulting to 'all'.")
                # Keep group_id_to_filter as 'all'


        start_date = None
        if time_period == 'last_month':
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        elif time_period == 'last_year':
            start_date = datetime.now(timezone.utc) - timedelta(days=365)

        # --- START: Determine IDs of events current user is attending AND has access to ---
        
        # 1. Event IDs user has RSVP'd "attending" to
        rsvpd_attending_event_ids_stmt = db.select(EventRSVP.event_id)\
            .where(EventRSVP.user_id == user.id)\
            .where(EventRSVP.status == 'attending')
        rsvpd_attending_event_ids = db.session.scalars(rsvpd_attending_event_ids_stmt).all()

        if not rsvpd_attending_event_ids:
            # No events attended, so spending is zero for all categories
            response_data = {
                "analysis_type": analysis_type,
                "title": f"Attended Event Spending by Category (No events attended)",
                "data": [], # Empty data
                "config_used": config
            }
            return jsonify(response_data)

        # 2. Filter these by accessibility (group OR invitation)
        #    AND by the optional group_id_to_filter for the panel
        
        # Subquery for events accessible via group membership
        # If group_id_to_filter is a specific group, only consider that group
        group_accessible_stmt = db.select(Event.id).distinct()\
            .join(Node, Event.node_id == Node.id)\
            .join(Group, Node.group_id == Group.id)\
            .join(GroupMember, Group.id == GroupMember.group_id)\
            .where(GroupMember.user_id == user.id)\
            .where(Event.id.in_(rsvpd_attending_event_ids))
        
        if group_id_to_filter != 'all': # If a specific group is chosen for the panel
            group_accessible_stmt = group_accessible_stmt.where(Group.id == group_id_to_filter)
        
        group_accessible_event_ids_sq = group_accessible_stmt.subquery()

        # Subquery for events accessible via direct invitation
        # If group_id_to_filter is active, invited events are only included IF they ALSO belong to that filtered group.
        # This makes sense for "spending by category within a group".
        # If group_id_to_filter is 'all', then invited events are included regardless of their group (if any).
        invited_accessible_stmt = db.select(Event.id).distinct()\
            .join(InvitedGuest, Event.id == InvitedGuest.event_id)\
            .where(InvitedGuest.email == user.email)\
            .where(Event.id.in_(rsvpd_attending_event_ids))

        if group_id_to_filter != 'all':
            # If filtering by a specific group, an invited event must ALSO belong to that group
            # (via its Node) to be included in this panel's aggregation.
            invited_accessible_stmt = invited_accessible_stmt\
                .join(Node, Event.node_id == Node.id) \
                .where(Node.group_id == group_id_to_filter)
                
        invited_event_ids_sq = invited_accessible_stmt.subquery()

        # Get the final list of event IDs to aggregate costs for
        final_event_ids_to_sum_stmt = db.select(Event.id).distinct()\
            .where(
                or_(
                    Event.id.in_(db.select(group_accessible_event_ids_sq.c.id)),
                    Event.id.in_(db.select(invited_event_ids_sq.c.id))
                )
            )
        final_event_ids_to_sum = db.session.scalars(final_event_ids_to_sum_stmt).all()

        print(f"Final event IDs to sum: {final_event_ids_to_sum}") # Debugging line
        
        if not final_event_ids_to_sum:
            # No events meet all criteria (attended, accessible, and panel's group filter)
            title_group_part = f"({specific_group_name_for_title})" if specific_group_name_for_title else "(All Accessible Groups)"
            response_data = {
                "analysis_type": analysis_type,
                "title": f"Attended Event Spending by Category {title_group_part} (No matching events)",
                "data": [], # Empty data
                "config_used": config
            }
            return jsonify(response_data)
        # --- END: Determine IDs of events ---


        # --- AGGREGATION QUERY using the final_event_ids_to_sum ---
        stmt = db.select(
                Node.label.label('category'),
                func.sum(Event.cost_value).label('total_cost')
            ).select_from(Event) \
            .join(Node, Event.node_id == Node.id) \
            .where(Event.id.in_(final_event_ids_to_sum)) \
            .where(Event.cost_value.isnot(None)) \
            .where(Event.cost_value > 0)

        if start_date:
            stmt = stmt.where(Event.date >= start_date)
        
        # The panel's group_id_to_filter was already applied when determining final_event_ids_to_sum.
        # Node.group_id might be needed if an event in final_event_ids_to_sum could belong to multiple nodes/categories
        # but for "spending by category", each event usually has one node.
        # If group_id_to_filter != 'all':
        #    stmt = stmt.where(Node.group_id == group_id_to_filter) # This is already handled above

        stmt = stmt.group_by(Node.label).order_by(func.sum(Event.cost_value).desc())
        
        results = db.session.execute(stmt).all()
        # --- END OF AGGREGATION QUERY ---

        analysis_data = [
            {"category": row.category, "amount": round(row.total_cost or 0, 2)}
            for row in results
        ]
        
        title_group_part = f"({specific_group_name_for_title})" if specific_group_name_for_title else "(All User's Groups)"
        title_time_part = time_period.replace('_', ' ').title()
        final_report_title = f"Attended Event Spending by Category {title_group_part} - {title_time_part}"

        response_data = {
            "analysis_type": analysis_type,
            "title": final_report_title,
            "data": analysis_data,
            "config_used": config
        }
        return jsonify(response_data)

    else:
        return jsonify({"error": f"Analysis type '{analysis_type}' not implemented or not configured correctly."}), 404


# --- END OF FILE routes.py ---