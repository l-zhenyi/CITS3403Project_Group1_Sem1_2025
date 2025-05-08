import os
import random
from datetime import datetime, timedelta, timezone
from faker import Faker
from app import app, db
from app.models import User, FriendRequest

# Initialize faker
fake = Faker()

def create_random_users(count=30):
    """
    Create random users and add them to the database.
    
    Args:
        count: Number of users to generate
    
    Returns:
        List of created user objects
    """
    print(f"Creating {count} random users...")
    users = []
    
    for i in range(count):
        username = fake.user_name() + str(random.randint(1, 999))
        email = fake.email()
        password = "password123"  # Same password for all test users
        
        # Create user
        user = User(username=username, email=email)
        user.set_password(password)
        
        # Add random profile data
        user.about_me = fake.paragraph(nb_sentences=3)
        days_ago = random.randint(1, 30)
        user.last_seen = datetime.now(timezone.utc) - timedelta(days=days_ago)
        
        # Add to database
        db.session.add(user)
        users.append(user)
        
    db.session.commit()
    print(f"Successfully created {len(users)} users")
    return users

def create_friendships(users, connection_density=0.2):
    """
    Create friendship connections between users.
    
    Args:
        users: List of user objects
        connection_density: Probability of friendship between any two users (0-1)
    """
    print(f"Creating friendships with connection density {connection_density}...")
    friendship_count = 0
    pending_count = 0
    
    for i, user1 in enumerate(users):
        # Each user will try to connect with users after them in the list
        # This prevents duplicate friendship attempts
        for user2 in users[i+1:]:
            # Randomly decide whether to create a connection
            if random.random() < connection_density:
                # Randomly decide if friendship is established or still pending
                if random.random() < 0.7:  # 70% chance of established friendship
                    # Add bidirectional friendship
                    user1.friends.append(user2)
                    user2.friends.append(user1)
                    friendship_count += 1
                else:
                    # Create pending friend request - without created_at field
                    request = FriendRequest(
                        sender_id=user1.id,
                        receiver_id=user2.id
                    )
                    db.session.add(request)
                    pending_count += 1
    
    db.session.commit()
    print(f"Created {friendship_count} established friendships")
    print(f"Created {pending_count} pending friend requests")

def verify_relationships():
    """Verify that relationships are working correctly"""
    print("Verifying relationships...")
    
    # Check a few random users to ensure friendships are bidirectional
    users = User.query.limit(5).all()
    for user in users:
        print(f"\nUser: {user.username}")
        print(f"Friend count: {user.friends.count()}")
        
        # Check that friendships are bidirectional
        for friend in user.friends:
            is_bidirectional = user in friend.friends
            print(f"- Friend: {friend.username} (Bidirectional: {is_bidirectional})")
        
        # Check pending friend requests
        pending_sent = FriendRequest.query.filter_by(sender_id=user.id).count()
        pending_received = FriendRequest.query.filter_by(receiver_id=user.id).count()
        print(f"Pending requests sent: {pending_sent}")
        print(f"Pending requests received: {pending_received}")

if __name__ == "__main__":
    # Create application context
    with app.app_context():
        # Drop existing user-related data
        print("Clearing existing users and friend requests...")
        FriendRequest.query.delete()
        
        # We need to remove friendships before deleting users
        # This assumes there's a friendship association table
        user_friends_table = User.friends.prop.secondary
        db.session.execute(user_friends_table.delete())
        
        User.query.delete()
        db.session.commit()
        
        # Generate new data
        users = create_random_users(count=30)
        create_friendships(users, connection_density=0.2)
        
        # Verify relationships
        verify_relationships()
        
        print("\nUser generation complete!")
        print(f"Total users in database: {User.query.count()}")
        print(f"Total friend requests in database: {FriendRequest.query.count()}")