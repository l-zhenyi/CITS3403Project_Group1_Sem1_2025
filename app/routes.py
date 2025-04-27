from flask import render_template, redirect, url_for, flash, request, session, jsonify
from app import app, db
from app.forms import LoginForm, RegistrationForm, EditProfileForm, EmptyForm, PostForm, CreateGroupForm, MessageForm
from flask_login import current_user, login_user, logout_user, login_required
from app.models import User, Group, GroupMember, Event, EventRSVP, Node, Post, Message
from urllib.parse import urlparse
from datetime import datetime, timezone
from dateutil.parser import isoparse

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
    posts = current_user.followed_posts().paginate(
        page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False
    )
    next_url = url_for('index', page=posts.next_num) if posts.has_next else None 
    prev_url = url_for('index', page=posts.prev_num) if posts.has_prev else None 

    groups = (
        Group.query.join(GroupMember)
        .filter(GroupMember.user_id == current_user.id)
        .all()
    )

    return render_template(
        'index.html',
        title='Home',
        form=form,
        posts=posts.items,
        next_url=next_url,
        prev_url=prev_url,
        groups=groups, 
        user = current_user
    )

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
    return render_template('profile.html', user=current_user)

@app.route('/explore')
@login_required 
def explore():
    return render_template("explore.html", title='Explore')

@app.route('/planner')
@login_required 
def planner():
    return render_template('planner.html')

@app.route('/user/<username>') 
@login_required 
def user(username): 
    user = User.query.filter_by(username=username).first_or_404()
    page = request.args.get('page', 1, type=int)
    
    # Fetch posts
    posts = current_user.followed_posts().paginate(
        page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False
    )
    next_url = url_for('user', username=user.username, page=posts.next_num) \
        if posts.has_next else None 
    prev_url = url_for('user', username=user.username, page=posts.prev_num) \
        if posts.has_prev else None
    
    # Initialize the form
    form = EmptyForm()

    # Fetch groups
    if user == current_user:
        # For the current user's profile, show the groups they are a part of
        groups = current_user.groups
    else:
        # For another user's profile, show the groups they share with the current user
        groups = [group for group in current_user.groups if group in user.groups]
    
    # Render the template with the filtered groups
    return render_template('user.html', user=user, posts=posts.items, 
                           next_url=next_url, prev_url=prev_url, form=form, groups=groups)
 
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

# I changed the name because I'm using a form for create_group
@app.route('/api/groups', methods=['POST'])
def create_group_api():
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
        parsed_date = isoparse(iso_str) if iso_str else datetime.now(timezone.utc)
    except (ValueError, TypeError):
        parsed_date = datetime.now(timezone.utc)
    event = Event(
        title=data.get("title", "Untitled Event"), # Add default title
        date=parsed_date,
        location=data.get("location", "TBD"), # Add default location
        description=data.get("description"),
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
    return jsonify({'success': True})

@app.route('/api/nodes/<int:node_id>', methods=['DELETE'])
def delete_node(node_id):
    node = Node.query.get_or_404(node_id)

    for event in node.events:
        db.session.delete(event)

    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/follow/<username>', methods=['POST']) 
@login_required 
def follow(username): 
    form = EmptyForm() 
    if form.validate_on_submit(): 
        user = User.query.filter_by(username=username).first() 
        if user is None: 
            flash('User {} not found.'.format(username)) 
            return redirect(url_for('index')) 
        if user == current_user: 
            flash('You cannot follow yourself!') 
            return redirect(url_for('user', username=username)) 
        current_user.follow(user) 
        db.session.commit() 
        flash('You are following {}!'.format(username)) 
        return redirect(url_for('user', username=username)) 
    else: 
        return redirect(url_for('index')) 
 
@app.route('/unfollow/<username>', methods=['POST']) 
@login_required 
def unfollow(username): 
    form = EmptyForm() 
    if form.validate_on_submit(): 
        user = User.query.filter_by(username=username).first() 
        if user is None: 
            flash('User {} not found.'.format(username)) 
            return redirect(url_for('index')) 
        if user == current_user: 
            flash('You cannot unfollow yourself!') 
            return redirect(url_for('user', username=username)) 
        current_user.unfollow(user) 
        db.session.commit() 
        flash('You are not following {}.'.format(username)) 
        return redirect(url_for('user', username=username)) 
    else: 
        return redirect(url_for('index'))

@app.route("/create_group", methods=["GET", "POST"])
def create_group():
    form = CreateGroupForm()

    if form.validate_on_submit():
        # Get form data
        group_name = form.name.data
        about = form.about.data
        
        # Create and save the group
        new_group = Group(name=group_name, about=about)
        db.session.add(new_group)
        db.session.commit()

        # Automatically add the creator as the first member (assuming user is logged in)
        new_member = GroupMember(group_id=new_group.id, user_id=current_user.id)
        db.session.add(new_member)
        db.session.commit()

        flash("Group created successfully!", "success")
        return redirect(url_for("view_group", group_id=new_group.id))

    return render_template("create_group.html", form=form)

@app.route("/groups/<int:group_id>", methods=["GET", "POST"])
@login_required
def view_group(group_id):
    group = Group.query.get_or_404(group_id)
    form = PostForm()

    # Handle post creation
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
        return redirect(url_for("view_group", group_id=group.id))

    # Pagination logic for posts
    page = request.args.get('page', 1, type=int)
    pagination = Post.query.filter_by(group_id=group.id) \
        .order_by(Post.timestamp.desc()) \
        .paginate(page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)
    posts = pagination.items
    
    # URLs for pagination links
    next_url = url_for('view_group', group_id=group.id, page=pagination.next_num) if pagination.has_next else None
    prev_url = url_for('view_group', group_id=group.id, page=pagination.prev_num) if pagination.has_prev else None

    return render_template("view_group.html", group=group, posts=posts, form=form, pagination=pagination,
                           prev_url=prev_url, next_url=next_url)

 
@app.route('/send_message/<recipient>', methods=['GET', 'POST']) 
@login_required 
def send_message(recipient): 
    user = User.query.filter_by(username=recipient).first_or_404() 
    form = MessageForm()
    if form.validate_on_submit(): 
        msg = Message(sender=current_user, recipient=user, 
                      body=form.message.data) 
        db.session.add(msg) 
        db.session.commit() 
        flash(('Your message has been sent.')) 
        return redirect(url_for('user', username=recipient)) 
    return render_template('send_message.html', title=('Send Message'), 
                           form=form, recipient=recipient) 

@app.route('/messages') 
@login_required 
def messages(): 
    current_user.last_message_read_time = datetime.now(timezone.utc) 
    db.session.commit() 
    page = request.args.get('page', 1, type=int) 
    messages = Message.query.filter_by(recipient_id=current_user.id) \
        .order_by(Message.timestamp.desc()) \
        .paginate(page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False)

    # Handle next and previous pagination URLs
    next_url = url_for('messages', page=messages.next_num) if messages.has_next else None 
    prev_url = url_for('messages', page=messages.prev_num) if messages.has_prev else None 
    
    return render_template('messages.html', 
                           messages=messages.items, 
                           next_url=next_url, 
                           prev_url=prev_url)

@app.route('/search', methods=['GET'])
def search_users():
    # Get the search term from the query string
    search_query = request.args.get('username', '')

    if search_query:
        # Query the database for users whose username contains the search term (case insensitive)
        users = User.query.filter(User.username.ilike(f'%{search_query}%')).all()
    else:
        # If no search query, return all users (or you can return an empty list)
        users = []

    return render_template('search_users.html', users=users)

@app.route('/group/<int:group_id>/add_members', methods=['GET', 'POST'])
@login_required
def add_members(group_id):
    group = Group.query.get_or_404(group_id)

    if request.method == 'POST':
        username = request.form.get('username')
        user_to_add = User.query.filter_by(username=username).first()

        if not user_to_add:
            flash('User not found.')
            return redirect(url_for('add_members', group_id=group_id))

        # Check mutual following
        if not (current_user.is_following(user_to_add) and user_to_add.is_following(current_user)):
            flash('You can only add users who mutually follow you.')
            return redirect(url_for('add_members', group_id=group_id))

        # Check if already a member
        existing_member = GroupMember.query.filter_by(user_id=user_to_add.id, group_id=group_id).first()
        if existing_member:
            flash('User is already a group member.')
            return redirect(url_for('add_members', group_id=group_id))

        # Add to group
        new_membership = GroupMember(user_id=user_to_add.id, group_id=group_id)
        db.session.add(new_membership)
        db.session.commit()

        flash(f'{user_to_add.username} has been added to the group!')
        return redirect(url_for('view_group', group_id=group_id))

    return render_template('add_members.html', group=group)