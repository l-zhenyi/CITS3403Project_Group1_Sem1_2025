from flask import render_template, redirect, url_for, flash, request, session, jsonify
from app import app, db
from app.forms import LoginForm, RegistrationForm, EditProfileForm, EmptyForm, PostForm, CreateGroupForm
from flask_login import current_user, login_user, logout_user, login_required
from app.models import User, Group, GroupMember, Event, EventRSVP, Node, Post
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
        user=current_user
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
    posts = current_user.followed_posts().paginate(
        page=page, per_page=app.config['POSTS_PER_PAGE'], error_out=False
    )
    next_url = url_for('user', username=user.username, page=posts.next_num) \
        if posts.has_next else None 
    prev_url = url_for('user', username=user.username, page=posts.prev_num) \
        if posts.has_prev else None
    form = EmptyForm()
    groups = (
        Group.query.join(GroupMember)
        .filter(GroupMember.user_id == user.id)
        .all()
    )
    return render_template('user.html', user=current_user, posts=posts.items, 
                           next_url=next_url, prev_url=prev_url, form=form, group=groups)
 
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

    events = [
        event.to_dict() for event in group.events
    ]
    nodes = [
        node.to_dict() for node in group.nodes
    ] if hasattr(group, "nodes") else []

    return jsonify({
        "events": events,
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
        parsed_date = isoparse(iso_str)
    except ValueError:
        return jsonify({"error": "Invalid date format"}), 400

    event = Event(
        title=data.get("title"),
        date=parsed_date,
        location=data.get("location"),
        group_id=group_id,
        description=data.get("description"),
        x=data.get("x"),
        y=data.get("y")
    )
    db.session.add(event)
    db.session.commit()
    return jsonify(event.to_dict()), 201

@app.route('/api/events/<int:event_id>', methods=['PATCH'])
def update_event_position(event_id):
    data = request.get_json()
    event = db.session.get(Event, event_id)
    if not event:
        return jsonify({"error": "Event not found"}), 404

    if 'x' in data:
        event.x = data['x']
    if 'y' in data:
        event.y = data['y']

    db.session.commit()
    return jsonify(event.to_dict())

@app.route('/api/groups/<int:group_id>/nodes', methods=['POST'])
def create_node(group_id):
    group = Group.query.get_or_404(group_id)
    data = request.json

    label = data.get('label', 'Untitled')
    x = data.get('x', 400)
    y = data.get('y', 300)

    new_node = Node(label=label, x=x, y=y, group=group)
    db.session.add(new_node)
    db.session.commit()

    return jsonify(new_node.to_dict()), 201

@app.route('/api/nodes/<int:node_id>', methods=['PATCH'])
def update_node(node_id):
    node = Node.query.get_or_404(node_id)
    data = request.json

    if 'label' in data:
        node.label = data['label']
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']

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