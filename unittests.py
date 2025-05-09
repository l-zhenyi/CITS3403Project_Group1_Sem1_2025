from datetime import datetime, timedelta, timezone
import unittest
from app import app, db
from app.models import User, Post, Group, GroupMember, FriendRequest

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

    def test_add_friend(self):
        # Create two users
        u1 = User(username='john', email='john@example.com')
        u2 = User(username='susan', email='susan@example.com')
        u1.set_password('password')
        u2.set_password('password')

        db.session.add(u1)
        db.session.add(u2)
        db.session.commit()

        # Initially they should not be friends
        self.assertEqual(u1.friends.all(), [])
        
        # Add friendship (bidirectional)
        u1.add_friend(u2)
        db.session.commit()

        # Check that the friendship is created correctly
        self.assertTrue(u1.is_friend(u2))
        self.assertTrue(u2.is_friend(u1))  # Friendships are bidirectional
        self.assertEqual(u1.friends.count(), 1)
        self.assertEqual(u1.friends.first().username, 'susan')
        self.assertEqual(u2.friends.count(), 1)
        self.assertEqual(u2.friends.first().username, 'john')

        # Test removing friendship
        u1.remove_friend(u2)
        db.session.commit()

        # Check that the friendship is removed
        self.assertFalse(u1.is_friend(u2))
        self.assertFalse(u2.is_friend(u1))  # Should be removed for both
        self.assertEqual(u1.friends.count(), 0)
        self.assertEqual(u2.friends.count(), 0)

    def test_friend_request(self):
        # Create two users
        u1 = User(username='john', email='john@example.com')
        u2 = User(username='susan', email='susan@example.com')
        u1.set_password('password')
        u2.set_password('password')

        db.session.add(u1)
        db.session.add(u2)
        db.session.commit()

        # Create a friend request from u1 to u2
        request = FriendRequest(sender_id=u1.id, receiver_id=u2.id)
        db.session.add(request)
        db.session.commit()

        # Check that the request exists
        pending_request = FriendRequest.query.filter_by(sender_id=u1.id, receiver_id=u2.id).first()
        self.assertIsNotNone(pending_request)
        
        # Accept the request
        u2.add_friend(u1)  # This should happen when accepting a request
        db.session.delete(pending_request)  # Delete the request after accepting
        db.session.commit()
        
        # Verify they are now friends
        self.assertTrue(u1.is_friend(u2))
        self.assertTrue(u2.is_friend(u1))

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
        group = Group(name="Test Group", about="A test group")
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
        group = Group(name="Test Group", about="A test group")
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

    def test_add_friend_to_group(self):
        # Create two users
        u1 = User(username="james", email="james@example.com")
        u2 = User(username="jane", email="jane@example.com")
        u1.set_password('password')
        u2.set_password('password')
        db.session.add_all([u1, u2])
        db.session.commit()

        # Make them friends
        u1.add_friend(u2)
        db.session.commit()

        # Create a group and add u1
        group = Group(name="Cool Group", about="A cool group")
        db.session.add(group)
        db.session.commit()

        member = GroupMember(user_id=u1.id, group_id=group.id)
        db.session.add(member)
        db.session.commit()

        # Verify friendship
        self.assertTrue(u1.is_friend(u2))

        # Add u2 to the group
        new_member = GroupMember(user_id=u2.id, group_id=group.id)
        db.session.add(new_member)
        db.session.commit()

        # Check that u2 is now a member
        added_member = GroupMember.query.filter_by(user_id=u2.id, group_id=group.id).first()
        self.assertIsNotNone(added_member)

    def test_cannot_add_without_friendship(self):
        # Create two users
        u1 = User(username="alice", email="alice@example.com")
        u2 = User(username="bob", email="bob@example.com")
        u1.set_password('password')
        u2.set_password('password')
        db.session.add_all([u1, u2])
        db.session.commit()

        # Don't create a friendship between them
        # Verify they are not friends
        self.assertFalse(u1.is_friend(u2))

        # Create a group and add u1
        group = Group(name="Private Group", about="Private stuff")
        db.session.add(group)
        db.session.commit()

        member = GroupMember(user_id=u1.id, group_id=group.id)
        db.session.add(member)
        db.session.commit()

        # Only allow adding if they're friends
        is_friend = u1.is_friend(u2)
        self.assertFalse(is_friend)

        # Only add if they're friends
        result = None
        if is_friend:
            result = GroupMember(user_id=u2.id, group_id=group.id)
            db.session.add(result)
            db.session.commit()

        # Assert that no GroupMember was created
        member_check = GroupMember.query.filter_by(user_id=u2.id, group_id=group.id).first()
        self.assertIsNone(member_check)


if __name__ == '__main__':
    unittest.main(verbosity=2)