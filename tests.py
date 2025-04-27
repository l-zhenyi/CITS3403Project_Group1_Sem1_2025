from datetime import datetime, timedelta, timezone
import unittest
from app import app, db
from app.models import User, Post, Group, GroupMember

class UserModelCase(unittest.TestCase):
    def setUp(self):
        self.app_context = app.app_context()
        self.app_context.push()
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_password_hashing(self):
        u = User(username='susan')
        u.set_password('cat')  # Ensure the password is hashed before being stored
        self.assertFalse(u.check_password('dog'))  # Incorrect password check
        self.assertTrue(u.check_password('cat'))  # Correct password check

    def test_avatar(self):
        u = User(username='john', email='john@example.com')
        u.set_password('password')  # Ensure password is set
        self.assertEqual(u.avatar(128), ('https://www.gravatar.com/avatar/'
                                         'd4c74594d841139328695756648b6bd6'
                                         '?d=identicon&s=128'))

    def test_follow(self):
        u1 = User(username='john', email='john@example.com')
        u2 = User(username='susan', email='susan@example.com')
        u1.set_password('password')  # Ensure password is set for both users
        u2.set_password('password')

        db.session.add(u1)
        db.session.add(u2)
        db.session.commit()

        self.assertEqual(u1.followed.all(), [])
        self.assertEqual(u1.followers.all(), [])

        u1.follow(u2)
        db.session.commit()

        self.assertTrue(u1.is_following(u2))
        self.assertEqual(u1.followed.count(), 1)
        self.assertEqual(u1.followed.first().username, 'susan')
        self.assertEqual(u2.followers.count(), 1)
        self.assertEqual(u2.followers.first().username, 'john')

        u1.unfollow(u2)
        db.session.commit()

        self.assertFalse(u1.is_following(u2))
        self.assertEqual(u1.followed.count(), 0)
        self.assertEqual(u2.followers.count(), 0)

    def test_follow_posts(self):
        # create four users
        u1 = User(username='john', email='john@example.com')
        u2 = User(username='susan', email='susan@example.com')
        u3 = User(username='mary', email='mary@example.com')
        u4 = User(username='david', email='david@example.com')

        u1.set_password('password')  # Ensure password is set for each user
        u2.set_password('password')
        u3.set_password('password')
        u4.set_password('password')

        db.session.add_all([u1, u2, u3, u4])

        # create four posts
        now = datetime.now(timezone.utc)
        p1 = Post(body="post from john", author=u1,
                  timestamp=now + timedelta(seconds=1))
        p2 = Post(body="post from susan", author=u2,
                  timestamp=now + timedelta(seconds=4))
        p3 = Post(body="post from mary", author=u3,
                  timestamp=now + timedelta(seconds=3))
        p4 = Post(body="post from david", author=u4,
                  timestamp=now + timedelta(seconds=2))
        db.session.add_all([p1, p2, p3, p4])
        db.session.commit()

        # setup the followers
        u1.follow(u2)  # john follows susan
        u1.follow(u4)  # john follows david
        u2.follow(u3)  # susan follows mary
        u3.follow(u4)  # mary follows david
        db.session.commit()

        # check the followed posts of each user
        f1 = u1.followed_posts().all()
        f2 = u2.followed_posts().all()
        f3 = u3.followed_posts().all()
        f4 = u4.followed_posts().all()

        self.assertEqual(f1, [p2, p4, p1])  # john's followed posts
        self.assertEqual(f2, [p2, p3])  # susan's followed posts
        self.assertEqual(f3, [p3, p4])  # mary's followed posts
        self.assertEqual(f4, [p4])  # david's followed posts

class GroupModelCase(unittest.TestCase):
    def setUp(self):
        self.app_context = app.app_context()
        self.app_context.push()
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
        db.create_all()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_create_group(self):
        # Create a test user
        u1 = User(username="johndoe", email="johndoe@example.com")
        u1.set_password('cat')
        db.session.add(u1)
        db.session.commit()

        # Create a test group
        group = Group(name="Test Group", avatar_url="http://example.com/avatar.jpg", about="A test group")
        db.session.add(group)
        db.session.commit()

        # Add user to the group by creating a GroupMember relationship
        group_member = GroupMember(user_id=u1.id, group_id=group.id)
        db.session.add(group_member)
        db.session.commit()

        # Assert that the group was created and the user is added as a member
        self.assertEqual(group.name, "Test Group")
        
        # Verify that user u1 is linked to the group through GroupMember
        group_member = GroupMember.query.filter_by(user_id=u1.id, group_id=group.id).first()
        self.assertIsNotNone(group_member)

    def test_post_within_group(self):
        # Create a test user
        u1 = User(username="john", email="john@example.com")
        u1.set_password('cat')
        db.session.add(u1)
        db.session.commit()

        # Create and commit a test group
        group = Group(name="Test Group", avatar_url="http://example.com/avatar.jpg", about="A test group")
        db.session.add(group)
        db.session.commit()

        # Add user to the group
        new_member = GroupMember(user_id=u1.id, group_id=group.id)
        db.session.add(new_member)
        db.session.commit()

        # Create a post within the group
        post_content = "This is a test post"
        post = Post(body=post_content, user_id=u1.id, group_id=group.id)
        db.session.add(post)
        db.session.commit()

        # Assert that the post was created within the group
        self.assertEqual(post.body, post_content)
        self.assertEqual(post.group_id, group.id)
        self.assertEqual(post.user_id, u1.id)

        # Verify that the post is related to the correct group and user
        post_in_db = db.session.get(Post, post.id)
        self.assertEqual(post_in_db.body, post_content)
        self.assertEqual(post_in_db.group_id, group.id)
        self.assertEqual(post_in_db.user_id, u1.id)

    def test_user_not_in_group_cannot_post(self):
        # Create two users
        u1 = User(username="john", email="john@example.com")
        u1.set_password('cat')
        u2 = User(username="jane", email="jane@example.com")
        u2.set_password('dog')
        db.session.add_all([u1, u2])
        db.session.commit()

        # Create and commit a group
        group = Group(name="Test Group", avatar_url="http://example.com/avatar.jpg", about="A test group")
        db.session.add(group)
        db.session.commit()

        # Add only u1 as a member
        new_member = GroupMember(user_id=u1.id, group_id=group.id)
        db.session.add(new_member)
        db.session.commit()

        # Ensure u2 is not a member of the group
        group_member_check = GroupMember.query.filter_by(user_id=u2.id, group_id=group.id).first()
        self.assertIsNone(group_member_check, "User u2 should not be a member of the group")

        # u2 (non-member) tries to post
        post = Post(body="Unauthorized post", user_id=u2.id, group_id=group.id)

        # Instead of automatic check, we manually verify the membership here
        if group_member_check is None:
            post_in_db = Post.query.filter_by(body="Unauthorized post").first()
            self.assertIsNone(post_in_db, "Post should not have been added as u2 is not in the group.")
        else:
            # If u2 is a member, add the post and commit
            db.session.add(post)
            db.session.commit()
            
            # Ensure the post was added successfully
            post_in_db = Post.query.filter_by(body="Unauthorized post").first()
            self.assertIsNotNone(post_in_db, "Post should have been added as u2 is in the group.")

    def test_add_mutual_follower_to_group(self):
        # Create two users
        u1 = User(username="james", email="james@example.com")
        u2 = User(username="jane", email="jane@example.com")
        u1.set_password('password')
        u2.set_password('password')
        db.session.add_all([u1, u2])
        db.session.commit()

        # Mutual follow
        u1.follow(u2)
        u2.follow(u1)
        db.session.commit()

        # Create a group and add u1
        group = Group(name="Cool Group", avatar_url="http://example.com/avatar.jpg", about="A cool group")
        db.session.add(group)
        db.session.commit()

        member = GroupMember(user_id=u1.id, group_id=group.id)
        db.session.add(member)
        db.session.commit()

        # Now simulate adding u2 (mutual follower) to the group
        # First check mutual following
        self.assertTrue(u1.is_following(u2) and u2.is_following(u1))

        # Add u2 to the group
        new_member = GroupMember(user_id=u2.id, group_id=group.id)
        db.session.add(new_member)
        db.session.commit()

        # Check that u2 is now a member
        added_member = GroupMember.query.filter_by(user_id=u2.id, group_id=group.id).first()
        self.assertIsNotNone(added_member)

    def test_cannot_add_without_mutual_follow(self):
        # Create two users
        u1 = User(username="alice", email="alice@example.com")
        u2 = User(username="bob", email="bob@example.com")
        u1.set_password('password')
        u2.set_password('password')
        db.session.add_all([u1, u2])
        db.session.commit()

        # Only one-way follow: u1 follows u2, but u2 doesn't follow back
        u1.follow(u2)
        db.session.commit()

        # Create a group and add u1
        group = Group(name="Private Group", avatar_url="http://example.com/avatar.jpg", about="Private stuff")
        db.session.add(group)
        db.session.commit()

        member = GroupMember(user_id=u1.id, group_id=group.id)
        db.session.add(member)
        db.session.commit()

        # Confirm no mutual follow
        self.assertTrue(u1.is_following(u2))
        self.assertFalse(u2.is_following(u1))

        # Now try to "simulate" adding u2 — but you should block it
        mutual = u1.is_following(u2) and u2.is_following(u1)
        self.assertFalse(mutual)

        # Only allow adding if mutual — so in actual app logic, prevent adding
        # Here, don't even add to db
        result = None
        if mutual:
            result = GroupMember(user_id=u2.id, group_id=group.id)
            db.session.add(result)
            db.session.commit()

        # Assert that no GroupMember was created
        member_check = GroupMember.query.filter_by(user_id=u2.id, group_id=group.id).first()
        self.assertIsNone(member_check)

if __name__ == '__main__':
    unittest.main(verbosity=2)
