# --- START OF FILE routes.py ---

from flask import render_template, redirect, url_for, flash, request, session, jsonify, abort
from app import app, db
from app.forms import LoginForm, RegistrationForm, EditProfileForm, EmptyForm, PostForm, CreateGroupForm, MessageForm, FriendRequestForm
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
    friends_list = current_user.friends.all()  # Use `.all()` if the relationship is lazy="dynamic"

    # Get pending friend requests (assuming a FriendRequest model exists)
    friend_requests = FriendRequest.query.filter_by(receiver_id=current_user.id).all()

    # Prepare a forms dictionary mapping usernames to FriendRequestForm instances
    forms = {user.username: FriendRequestForm(receiver_username=user.username) for user in friends_list}
    return render_template('friends.html', friends=friends_list, friend_requests=friend_requests, forms=forms)


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
    sent_requests_set = {req.receiver_id for req in FriendRequest.query.filter_by(sender_id=current_user.id).all()}

    # Get users who have sent friend requests to the current user
    received_requests_map = {req.sender_id: req.id for req in FriendRequest.query.filter_by(receiver_id=current_user.id).all()}

    # Also get the pending friend requests
    friend_requests_list = FriendRequest.query.filter_by(receiver_id=current_user.id).all()

    forms = {user.username: FriendRequestForm(receiver_username=user.username) for user in search_results}

    # Render the friends page with search results, sent requests, and friend requests
    friends_list = current_user.friends.all()
    return render_template('friends.html', 
                          friends=friends_list, 
                          search_results=search_results, 
                          sent_requests=sent_requests_set,
                          received_requests=received_requests_map,
                          friend_requests=friend_requests_list, forms=forms)

@app.route('/handle_friend_request', methods=['POST'])
@login_required
def handle_friend_request():
    request_id = request.form.get('request_id')
    action = request.form.get('action')

    # Fetch the friend request
    friend_request_obj = FriendRequest.query.get(request_id)
    if not friend_request_obj or friend_request_obj.receiver_id != current_user.id:
        flash('Invalid friend request.', 'danger')
        return redirect(url_for('friends'))

    if action == 'accept':
        # Add the sender as a friend
        current_user.add_friend(friend_request_obj.sender)
        db.session.delete(friend_request_obj)  # Remove the friend request
        db.session.commit()
        flash(f'You are now friends with {friend_request_obj.sender.username}!', 'success')
    elif action == 'reject':
        # Reject the friend request
        db.session.delete(friend_request_obj)
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
    friend_user = User.query.get(friend_id)
    if not friend_user:
        flash('User not found.', 'danger')
        return redirect(url_for('friends'))

    # Add the friend
    if current_user.is_friend(friend_user):
        flash(f'{friend_user.username} is already your friend.', 'info')
    else:
        current_user.add_friend(friend_user)
        db.session.commit()
        flash(f'{friend_user.username} has been added to your friends list!', 'success')

    return redirect(url_for('friends'))

@app.route('/remove_friend', methods=['POST'])
@login_required
def remove_friend():
    friend_id = request.form.get('friend_id')
    if not friend_id:
        flash('Invalid friend ID.', 'danger')
        return redirect(url_for('friends'))

    # Find the user by ID
    friend_user = User.query.get(friend_id)
    if not friend_user:
        flash('User not found.', 'danger')
        return redirect(url_for('friends'))

    # Remove the friend
    if current_user.is_friend(friend_user):
        current_user.remove_friend(friend_user)
        db.session.commit()
        flash(f'{friend_user.username} has been removed from your friends list.', 'success')
    else:
        flash(f'{friend_user.username} is not in your friends list.', 'info')

    return redirect(url_for('friends'))

@app.route('/send_friend_request', methods=['POST'])
@login_required
def send_friend_request():
    receiver_username = request.form.get('receiver_username')
    if not receiver_username:
        flash('Please provide a username.', 'danger')
        return redirect(url_for('friends'))

    receiver_user = User.query.filter_by(username=receiver_username).first()
    if not receiver_user:
        flash('User not found.', 'danger')
        return redirect(url_for('friends'))

    if current_user.is_friend(receiver_user):
        flash(f'{receiver_user.username} is already your friend.', 'info')
    elif FriendRequest.query.filter_by(sender_id=current_user.id, receiver_id=receiver_user.id).first():
        flash(f'You have already sent a friend request to {receiver_user.username}.', 'info')
    else:
        friend_request_obj = FriendRequest(sender=current_user, receiver=receiver_user)
        db.session.add(friend_request_obj)
        db.session.commit()
        flash(f'Friend request sent to {receiver_user.username}!', 'success')

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

    form = FriendRequestForm()
    form.receiver_username.data = user_obj.username

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
        group = Group(
            name=form.name.data, 
            about=form.about.data,
            owner_id=current_user.id # Set owner on creation
        )
        db.session.add(group)
        db.session.flush()
        membership = GroupMember(
            user_id=current_user.id, 
            group_id=group.id,
            is_owner=True # Mark creator as owner in GroupMember
        )
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
    
    # Permission check: Only owner should be able to add members via this route
    if group.owner_id != current_user.id:
        flash("Only the group owner can add members.", "warning")
        return redirect(url_for('view_group', group_id=group_id))

    friends_list = current_user.friends.all()
    
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

        # is_friends_check = current_user.is_friend(user_to_add) # This might be too restrictive if owner can add anyone
        # if not is_friends_check:
        #     flash(f"You need to be friends with {user_to_add.username} before adding them to the group.")
        #     return redirect(url_for('add_members', group_id=group_id))

        new_membership = GroupMember(user_id=user_to_add.id, group_id=group_id, is_owner=False) # New members are not owners
        db.session.add(new_membership)
        db.session.commit()

        flash(f'{user_to_add.username} has been added to the group!')
        return redirect(url_for('view_group', group_id=group_id))

    eligible_friends = []
    for friend_item in friends_list:
        if not is_group_member(friend_item.id, group_id):
            eligible_friends.append(friend_item)

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


# NEW API Endpoint for fetching current user's friends
@app.route("/api/me/friends", methods=["GET"])
@login_required
def get_my_friends():
    friends_list = current_user.friends.all() # Assuming 'friends' is the relationship name
    friends_data = [
        {"id": friend.id, "username": friend.username, "avatar_url": friend.avatar(40)}
        for friend in friends_list
    ]
    return jsonify(friends_data)


@app.route("/api/groups", methods=["GET"])
@login_required
def get_groups():
    # Correctly fetch groups the user is a member of
    groups_query = db.select(Group).join(GroupMember).filter(GroupMember.user_id == current_user.id)\
        .options(joinedload(Group.owner)) # Eager load owner for to_dict efficiency if needed elsewhere
    # If Group.members relationship is lazy='dynamic', you might need joinedload(Group.members).joinedload(GroupMember.user)
    # if to_dict directly accesses member user details without another query.
    # Given Group.members is lazy="joined" in model, this should be fine.

    user_groups = db.session.scalars(groups_query).unique().all() # +++ ADDED .unique() +++
    group_data = [g.to_dict(include_nodes=False, include_members=False) for g in user_groups] # Default no members for list view
    return jsonify(group_data)


@app.route("/api/groups", methods=["POST"])
@login_required
def create_group_api():
    data = request.get_json() or {}
    name = data.get("name")
    description = data.get("description", "")
    avatar_url = data.get("avatar_url")
    member_ids_to_add_str = data.get("member_ids", [])

    if not name or not isinstance(name, str) or len(name.strip()) == 0:
        return jsonify({"error": "Group name is required and cannot be empty"}), 400

    final_avatar_url = avatar_url
    if not final_avatar_url and name.strip():
        final_avatar_url = f"https://via.placeholder.com/40/cccccc/FFFFFF?text={name.strip()[0].upper()}"

    group = Group(name=name.strip(),
                  avatar_url=final_avatar_url,
                  about=description.strip(),
                  owner_id=current_user.id)
    db.session.add(group)
    # Flush to get group.id for GroupMember instances
    db.session.flush()

    current_user_membership = GroupMember(
        group_id=group.id,
        user_id=current_user.id,
        is_owner=True
    )
    db.session.add(current_user_membership)

    processed_member_ids = set()
    if member_ids_to_add_str:
        for member_id_str in member_ids_to_add_str:
            try:
                member_id = int(member_id_str)
                if member_id == current_user.id or member_id in processed_member_ids:
                    continue

                # Optional: Check if user_to_add exists and is friend (if desired)
                # user_to_add_obj = db.session.get(User, member_id)
                # if not user_to_add_obj:
                #     app.logger.warning(f"Attempt to add non-existent user {member_id} to new group.")
                #     continue
                # if not current_user.is_friend(user_to_add_obj): # If you want to restrict to friends
                #     app.logger.warning(f"User {current_user.username} tried to add non-friend {user_to_add_obj.username} to new group.")
                #     continue

                existing_member_check = db.session.scalar(
                    db.select(GroupMember.id).filter_by(group_id=group.id, user_id=member_id)
                )
                if not existing_member_check: # Should always be true for new members during group creation
                    new_member = GroupMember(group_id=group.id, user_id=member_id, is_owner=False)
                    db.session.add(new_member)
                    processed_member_ids.add(member_id)
            except ValueError:
                app.logger.warning(f"Invalid member_id '{member_id_str}' provided during group creation.")

    db.session.commit()

    # Re-fetch the group with all necessary relationships loaded for the response
    # This ensures 'members' and 'owner' are correctly populated for to_dict
    group_for_response = db.session.query(Group).options(
        joinedload(Group.owner),
        joinedload(Group.members).joinedload(GroupMember.user) # Eagerly load members and their user details
    ).filter_by(id=group.id).one_or_none()

    if not group_for_response:
         app.logger.error(f"Failed to re-fetch group {group.id} after creation.")
         return jsonify({"error": "Group created but could not retrieve details for response."}), 500

    return jsonify(group_for_response.to_dict(include_nodes=False, include_members=True)), 201


# +++ MODIFIED GROUP DETAIL ENDPOINT (GET /api/groups/<id>) +++
@app.route("/api/groups/<int:group_id>", methods=["GET"])
@login_required
@require_group_member 
def get_group_detail(group_id):
    include_members = request.args.get('include_members', 'false').lower() == 'true'

    query_options = [joinedload(Group.owner)]
    if include_members:
        query_options.append(joinedload(Group.members).joinedload(GroupMember.user))

    group_query = db.select(Group).where(Group.id == group_id).options(*query_options)
    group = db.session.scalar(group_query)

    if not group:
        return jsonify({"error": "Group not found"}), 404

    return jsonify(group.to_dict(include_nodes=False, include_members=include_members))


# +++ NEW: GROUP UPDATE ENDPOINT (PATCH /api/groups/<id>) +++
@app.route("/api/groups/<int:group_id>", methods=["PATCH"])
@login_required
@require_group_member 
def update_group_details(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        return jsonify({"error": "Group not found"}), 404

    # Authorization check (e.g., owner)
    if group.owner_id != current_user.id:
        return jsonify({"error": "Only the group owner can modify group settings."}), 403

    data = request.get_json() or {}
    updated_fields_count = 0

    if "name" in data:
        # ... (name update logic) ...
        new_name = data["name"].strip()
        if not new_name:
            return jsonify({"error": "Group name cannot be empty"}), 400
        if new_name != group.name:
            group.name = new_name
            updated_fields_count += 1

    if "description" in data:
        # ... (description update logic) ...
        new_description = data["description"].strip()
        if new_description != group.about:
            group.about = new_description
            updated_fields_count += 1
    
    # Logic for adding members
    if "add_member_ids" in data and isinstance(data["add_member_ids"], list):
        member_ids_to_add = [int(mid) for mid in data["add_member_ids"] if isinstance(mid, (int, str)) and str(mid).isdigit()]
        
        # Fetch current member IDs more efficiently if group.members is already loaded or by query
        # If group.members is lazy="joined", it should be loaded.
        # Otherwise, query:
        # existing_member_ids_in_group_q = db.session.scalars(
        #     db.select(GroupMember.user_id).filter_by(group_id=group.id)
        # ).all()
        # existing_member_ids_in_group = set(existing_member_ids_in_group_q)

        existing_member_ids_in_group = {gm.user_id for gm in group.members}


        for user_id_to_add in member_ids_to_add:
            if user_id_to_add == current_user.id or user_id_to_add in existing_member_ids_in_group:
                continue
            
            user_to_add_obj = db.session.get(User, user_id_to_add)
            if not user_to_add_obj:
                app.logger.warning(f"Attempt to add non-existent user {user_id_to_add} to group {group_id}")
                continue
            
            # Optional: Check if friends, etc.
            # if not current_user.is_friend(user_to_add_obj):
            #     app.logger.warning(f"User {current_user.id} tried to add non-friend {user_id_to_add_obj.username} to group {group_id}")
            #     continue

            new_member = GroupMember(group_id=group.id, user_id=user_id_to_add, is_owner=False)
            db.session.add(new_member) # Add to session, will be part of the commit
            updated_fields_count += 1
            app.logger.info(f"User {user_id_to_add} queued for addition to group {group_id} by {current_user.username}")


    if updated_fields_count > 0:
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Error updating group {group_id}: {e}")
            return jsonify({"error": "Failed to save group changes."}), 500
    
    # Re-fetch for the response to ensure all changes (especially new members) are reflected
    group_for_response = db.session.query(Group).options(
        joinedload(Group.owner),
        joinedload(Group.members).joinedload(GroupMember.user)
    ).filter_by(id=group_id).one_or_none()

    if not group_for_response:
         app.logger.error(f"Failed to re-fetch group {group_id} after update.")
         # group might have been deleted by another request, or other rare conditions
         return jsonify({"error": "Group details could not be retrieved after update."}), 500
         
    return jsonify(group_for_response.to_dict(include_nodes=False, include_members=True))


@app.route("/api/groups/<int:group_id>/nodes", methods=["GET"])
@login_required
@require_group_member
def get_group_nodes(group_id):
    group = db.session.get(Group, group_id)
    if not group:
        abort(404, description="Group not found")

    include_events_flag = request.args.get('include') == 'events'
    # Modify query to use options() for eager loading on the select() statement
    query = db.select(Node).where(Node.group_id == group_id)

    if include_events_flag:
        query = query.options(
            joinedload(Node.events)
                .joinedload(Event.attendees)
                .joinedload(EventRSVP.user),
            joinedload(Node.group) 
        )

    nodes = db.session.scalars(query).unique().all() 

    nodes_data = []
    for node_item in nodes: 
        node_dict = {
            "id": node_item.id,
            "label": node_item.label,
            "x": node_item.x,
            "y": node_item.y,
            "group_id": node_item.group_id,
            "events": []
        }
        if include_events_flag and node_item.events: # events are already loaded due to options()
            node_dict["events"] = [
                event.to_dict(current_user_id=current_user.id) for event in node_item.events
            ]
        nodes_data.append(node_dict)

    return jsonify(nodes_data)

@app.route("/api/groups/<int:group_id>/events", methods=["GET"])
@login_required
@require_group_member
def get_group_events_flat(group_id):
    events_query = db.select(Event).join(Node).filter(Node.group_id == group_id)\
        .options(
            joinedload(Event.node).joinedload(Node.group), 
            joinedload(Event.attendees).joinedload(EventRSVP.user) 
        )\
        .order_by(Event.date.desc())
    events_list = db.session.scalars(events_query).unique().all()
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
        if cost_input is not None and str(cost_input).strip() != "": 
            cost_value = float(cost_input)
    except (ValueError, TypeError):
        cost_value = None 
    
    location_coordinates = data.get("location_coordinates")


    event = Event(
        title=title,
        date=event_date,
        location=location,
        description=data.get("description", "").strip(),
        image_url=data.get("image_url"),
        cost_display=cost_display,
        cost_value=cost_value,
        node_id=node_id,
        location_coordinates=location_coordinates
    )
    db.session.add(event)
    # It's often better to commit here if to_dict relies on committed state or related objects that get IDs on commit.
    # However, for simple cases flush() might be enough. If issues, move commit before to_dict.
    db.session.flush() 

    # Eager load necessary relationships for to_dict before commit can sometimes be tricky
    # For event.to_dict, it needs event.node and event.node.group.
    # If these are not loaded before commit and accessed in to_dict, they might be None or cause issues.
    # A safer pattern is to commit, then re-fetch or refresh for the response.
    # However, let's try with flush and explicit refresh if needed.
    db.session.refresh(event, attribute_names=['node'])
    if event.node:
        db.session.refresh(event.node, attribute_names=['group'])

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
        x_coord = float(data.get("x", 0)) 
        y_coord = float(data.get("y", 0)) 
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid coordinates for node"}), 400

    node_obj = Node( 
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
    event_obj_loaded = db.session.query(Event).options(
        joinedload(Event.node).joinedload(Node.group),
        joinedload(Event.attendees).joinedload(EventRSVP.user) 
    ).filter(Event.id == event_id).first() 
    
    if not event_obj_loaded:
        return jsonify({"error": "Event not found"}), 404
    event_obj = event_obj_loaded


    group_id_for_event = None
    authorized_for_modification = False 
    
    if event_obj.node_id and event_obj.node and event_obj.node.group_id: 
        group_id_for_event = event_obj.node.group_id
        if is_group_member(current_user.id, group_id_for_event):
            authorized_for_modification = True
    
    if request.method == "GET":
        is_authorized_get, msg_get, status_get = _check_event_authorization(event_id, current_user.id)
        if not is_authorized_get:
             return jsonify({"error": msg_get}), status_get
        return jsonify(event_obj.to_dict(current_user_id=current_user.id))

    if not authorized_for_modification:
        return jsonify({"error": "Unauthorized action. Must be a member of the event's group to modify or delete."}), 403

    if request.method == "PATCH":
        data = request.get_json() or {}
        updated_fields = [] 

        if "title" in data:
            new_title = data["title"]
            if isinstance(new_title, str): 
                event_obj.title = new_title.strip()
                updated_fields.append("title")

        if "location" in data:
            new_location = data["location"]
            if isinstance(new_location, str):
                event_obj.location = new_location.strip()
                updated_fields.append("location")
            elif new_location is None: 
                event_obj.location = ""
                updated_fields.append("location")
        
        if "location_coordinates" in data: 
            new_coords = data["location_coordinates"]
            if isinstance(new_coords, str) and new_coords.strip():
                event_obj.location_coordinates = new_coords.strip()
            else: 
                event_obj.location_coordinates = None
            updated_fields.append("location_coordinates")

        if "location_key" in data: 
            new_key = data["location_key"]
            if isinstance(new_key, str) and new_key.strip():
                event_obj.location_key = new_key.strip()
            else: 
                event_obj.location_key = None
            updated_fields.append("location_key")

        if "description" in data:
            new_description = data["description"]
            if isinstance(new_description, str):
                event_obj.description = new_description.strip() 
                updated_fields.append("description")
            elif new_description is None: 
                event_obj.description = None
                updated_fields.append("description")

        if "date" in data:
            new_date_str = data["date"]
            if new_date_str is None: 
                event_obj.date = None
                updated_fields.append("date")
            elif isinstance(new_date_str, str):
                try:
                    parsed_date = isoparse(new_date_str)
                    if parsed_date.tzinfo is None:
                        parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                    event_obj.date = parsed_date
                    updated_fields.append("date")
                except (ValueError, TypeError):
                    app.logger.warning(f"Invalid date format for event {event_id}: {new_date_str}")
                    pass 

        if "original_input_text" in data: 
            original_input = data["original_input_text"]
            if original_input is not None: 
                 event_obj.cost_display = str(original_input)
                 updated_fields.append("cost_display")
        elif "cost_display" in data: 
            cost_display_val = data.get("cost_display")
            if cost_display_val is not None:
                 event_obj.cost_display = str(cost_display_val)
                 updated_fields.append("cost_display")

        if "cost_value" in data: 
            cost_val_input = data["cost_value"]
            if cost_val_input is None: 
                event_obj.cost_value = None
                updated_fields.append("cost_value")
            else:
                try:
                    event_obj.cost_value = float(cost_val_input)
                    updated_fields.append("cost_value")
                except (ValueError, TypeError):
                    app.logger.warning(f"Invalid cost_value for event {event_id}: {cost_val_input}")
                    pass
        
        if "node_id" in data and data["node_id"] != event_obj.node_id:
             new_node_id_val = data["node_id"] 
             if new_node_id_val is None: 
                  event_obj.node_id = None
                  updated_fields.append("node_id")
             else:
                try:
                    new_node_id_int = int(new_node_id_val)
                    target_node = db.session.get(Node, new_node_id_int)
                    if not target_node:
                        return jsonify({"error": "Target node not found."}), 400
                    
                    if group_id_for_event and target_node.group_id != group_id_for_event:
                        return jsonify({"error": "Cannot move event to a node in a different group."}), 400
                    
                    if not is_group_member(current_user.id, target_node.group_id): 
                        return jsonify({"error": "Cannot assign event to a node in a group you are not a member of."}), 403

                    event_obj.node_id = new_node_id_int
                    updated_fields.append("node_id")

                except (ValueError, TypeError):
                    return jsonify({"error": "Invalid node_id format."}), 400


        if updated_fields:
            try:
                db.session.commit()
                app.logger.info(f"Event {event_id} updated fields: {', '.join(updated_fields)}")
                
                event_obj_refreshed = db.session.query(Event).options(
                    joinedload(Event.node).joinedload(Node.group),
                    joinedload(Event.attendees).joinedload(EventRSVP.user)
                ).filter(Event.id == event_id).first()
                return jsonify(event_obj_refreshed.to_dict(current_user_id=current_user.id))


            except Exception as e:
                db.session.rollback()
                app.logger.error(f"Error committing updates for event {event_id}: {e}")
                return jsonify({"error": "Could not save changes to the event."}), 500
        
        return jsonify(event_obj.to_dict(current_user_id=current_user.id)) 


    if request.method == "DELETE":
        db.session.delete(event_obj)
        db.session.commit()
        return jsonify({"success": True, "message": "Event deleted successfully."})

    return jsonify({"error": "Method not allowed"}), 405

@app.route("/api/nodes/<int:node_id>", methods=["GET", "PATCH", "DELETE"])
@login_required
def manage_node(node_id):
    node_obj = db.session.get(Node, node_id) 
    if not node_obj:
        return jsonify({"error": "Node not found"}), 404

    if not is_group_member(current_user.id, node_obj.group_id):
        return jsonify({"error": "Unauthorized. Must be a member of the node's group."}), 403

    if request.method == "GET":
        include_events = request.args.get('include') == 'events'
        
        if include_events:
            # This ensures that when node_obj.to_dict is called, its events are already loaded
            node_obj_loaded = db.session.query(Node).options(
                joinedload(Node.events) # Load events
                    .joinedload(Event.attendees) # Then load attendees for each event
                    .joinedload(EventRSVP.user), # Then load user for each attendee
                joinedload(Node.group) 
            ).filter(Node.id == node_id).unique().first()
            if node_obj_loaded: node_obj = node_obj_loaded # Use the eagerly loaded object

        return jsonify(node_obj.to_dict(include_events=include_events, current_user_id=current_user.id))


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
        return jsonify(node_obj.to_dict(include_events=False, current_user_id=current_user.id))

    if request.method == "DELETE":
        events_on_node = db.session.scalars(db.select(Event.id).filter_by(node_id=node_id).limit(1)).first()
        if events_on_node:
            db.session.execute(
                db.update(Event).where(Event.node_id == node_id).values(node_id=None)
            )
            app.logger.info(f"Events previously on node {node_id} have been unassigned.")


        db.session.delete(node_obj)
        db.session.commit()
        return jsonify({"success": True, "message": "Node deleted successfully. Associated events (if any) are now unassigned."})


    return jsonify({"error": "Method not allowed"}), 405

def _check_event_authorization(event_id, user_id_to_check): 
    event_to_check = db.session.query(Event).options(
        joinedload(Event.node).joinedload(Node.group)
    ).filter(Event.id == event_id).first()
    
    if not event_to_check:
        return False, "Event not found", 404

    user_checking = db.session.get(User, user_id_to_check) 
    if not user_checking:
        return False, "User performing check not found", 404 

    if event_to_check.node_id and event_to_check.node and event_to_check.node.group_id:
        if is_group_member(user_id_to_check, event_to_check.node.group_id):
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

    rsvps = db.session.scalars(rsvps_query).unique().all() # Added .unique() here too

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
    
    if isinstance(new_status, str) and new_status.lower() == 'none':
        new_status = None
        
    if new_status not in allowed_statuses:
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

@app.route('/api/search/users', methods=['GET'])
@login_required
def api_search_users():
    query_param = request.args.get('q', '').strip() 
    limit = request.args.get('limit', 10, type=int)

    if not query_param:
        return jsonify([])

    users_query = db.select(User).filter(
            User.username.ilike(f'%{query_param}%'),
            User.id != current_user.id 
        ).limit(limit)

    found_users = db.session.scalars(users_query).all() 

    results = [{
        'id': u.id, 
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

    max_order_val = db.session.scalar( 
        db.select(func.max(InsightPanel.display_order)).where(InsightPanel.user_id == current_user.id)
    )
    next_order = (max_order_val + 1) if max_order_val is not None else 0
    
    panel_config = details.get('default_config', {}).copy()
    if 'configuration' in data and isinstance(data['configuration'], dict):
        panel_config.update(data['configuration'])


    new_panel = InsightPanel(
        user_id=current_user.id,
        analysis_type=analysis_type,
        title=details['title'], 
        description=details['description'],
        display_order=next_order,
        configuration=panel_config 
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
    
    user_panels_list = db.session.scalars( 
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
@app.route('/api/analysis/data/<analysis_type>', methods=['GET'])
@login_required
def get_analysis_data(analysis_type):
    panel_id = request.args.get('panel_id', type=int)
    panel = None
    config = {}
    user = current_user 

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
        
        group_id_to_filter = 'all' 
        specific_group_name_for_title = None

        if raw_group_id_filter != 'all':
            try:
                gid_int = int(raw_group_id_filter)
                group_for_filter = db.session.get(Group, gid_int)
                if group_for_filter and is_group_member(user.id, gid_int):
                    group_id_to_filter = gid_int
                    specific_group_name_for_title = group_for_filter.name
                else:
                    app.logger.warning(f"User {user.id} tried to filter spending by group {gid_int} they are not a member of. Defaulting to 'all'.")
            except ValueError:
                app.logger.warning(f"Invalid group_id '{raw_group_id_filter}' in spending config. Defaulting to 'all'.")

        start_date = None
        if time_period == 'last_month':
            start_date = datetime.now(timezone.utc) - timedelta(days=30)
        elif time_period == 'last_year':
            start_date = datetime.now(timezone.utc) - timedelta(days=365)
        
        rsvpd_attending_event_ids_stmt = db.select(EventRSVP.event_id)\
            .where(EventRSVP.user_id == user.id)\
            .where(EventRSVP.status == 'attending')
        rsvpd_attending_event_ids = db.session.scalars(rsvpd_attending_event_ids_stmt).all()

        if not rsvpd_attending_event_ids:
            response_data = {
                "analysis_type": analysis_type,
                "title": f"Attended Event Spending by Category (No events attended)",
                "data": [], 
                "config_used": config
            }
            return jsonify(response_data)
        
        group_accessible_stmt = db.select(Event.id).distinct()\
            .join(Node, Event.node_id == Node.id)\
            .join(Group, Node.group_id == Group.id)\
            .join(GroupMember, Group.id == GroupMember.group_id)\
            .where(GroupMember.user_id == user.id)\
            .where(Event.id.in_(rsvpd_attending_event_ids))
        
        if group_id_to_filter != 'all': 
            group_accessible_stmt = group_accessible_stmt.where(Group.id == group_id_to_filter)
        
        group_accessible_event_ids_sq = group_accessible_stmt.subquery()

        invited_accessible_stmt = db.select(Event.id).distinct()\
            .join(InvitedGuest, Event.id == InvitedGuest.event_id)\
            .where(InvitedGuest.email == user.email)\
            .where(Event.id.in_(rsvpd_attending_event_ids))

        if group_id_to_filter != 'all':
            invited_accessible_stmt = invited_accessible_stmt\
                .join(Node, Event.node_id == Node.id) \
                .where(Node.group_id == group_id_to_filter)
                
        invited_event_ids_sq = invited_accessible_stmt.subquery()

        final_event_ids_to_sum_stmt = db.select(Event.id).distinct()\
            .where(
                or_(
                    Event.id.in_(db.select(group_accessible_event_ids_sq.c.id)),
                    Event.id.in_(db.select(invited_event_ids_sq.c.id))
                )
            )
        final_event_ids_to_sum = db.session.scalars(final_event_ids_to_sum_stmt).all()
        
        if not final_event_ids_to_sum:
            title_group_part = f"({specific_group_name_for_title})" if specific_group_name_for_title else "(All Accessible Groups)"
            response_data = {
                "analysis_type": analysis_type,
                "title": f"Attended Event Spending by Category {title_group_part} (No matching events)",
                "data": [], 
                "config_used": config
            }
            return jsonify(response_data)

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
        
        stmt = stmt.group_by(Node.label).order_by(func.sum(Event.cost_value).desc())
        
        results = db.session.execute(stmt).all()

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


# --- Endpoint for All User Events (Calendar/List View) ---
@app.route('/api/me/all_events', methods=['GET'])
@login_required
def get_all_my_events():
    user_id = current_user.id
    user_email = current_user.email

    # Events from groups user is a member of
    group_events_stmt = db.select(Event).distinct() \
        .join(Node, Event.node_id == Node.id) \
        .join(Group, Node.group_id == Group.id) \
        .join(GroupMember, Group.id == GroupMember.group_id) \
        .where(GroupMember.user_id == user_id) \
        .options(
            joinedload(Event.node).joinedload(Node.group), 
            joinedload(Event.attendees).joinedload(EventRSVP.user) 
        )
    
    # Events user is directly invited to
    invited_events_stmt = db.select(Event).distinct() \
        .join(InvitedGuest, Event.id == InvitedGuest.event_id) \
        .where(InvitedGuest.email == user_email) \
        .options(
            joinedload(Event.node).joinedload(Node.group),
            joinedload(Event.attendees).joinedload(EventRSVP.user)
        )

    # Use .unique() when calling scalars() if joinedload involves collections
    group_events = db.session.scalars(group_events_stmt).unique().all()
    invited_events = db.session.scalars(invited_events_stmt).unique().all()

    all_user_events_map = {event.id: event for event in group_events}
    for event in invited_events:
        if event.id not in all_user_events_map:
            all_user_events_map[event.id] = event
    
    sorted_events = sorted(list(all_user_events_map.values()), key=lambda e: (e.date is None, e.date), reverse=True)

    events_data = [event.to_dict(current_user_id=user_id) for event in sorted_events]
    return jsonify(events_data)

# --- END OF FILE routes.py ---