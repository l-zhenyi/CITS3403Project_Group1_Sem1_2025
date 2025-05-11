import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
import uuid
from app import app, db
from app.models import User

class GroupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Set up the Flask app and database
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        with app.app_context():
            db.create_all()

            # Create a test user with a UUID username
            cls.test_username = f"user_{uuid.uuid4().hex[:6]}"
            test_user = User(username=cls.test_username, email=f"{cls.test_username}@example.com")
            test_user.set_password("testpassword")
            db.session.add(test_user)

            # Create another user to add as a group member
            cls.member_username = f"user_{uuid.uuid4().hex[:6]}"
            member_user = User(username=cls.member_username, email=f"{cls.member_username}@example.com")
            member_user.set_password("memberpassword")
            db.session.add(member_user)

            db.session.commit()

        # Set up the Selenium WebDriver
        cls.driver = webdriver.Chrome()  # Or use Firefox(), etc.
        cls.driver.implicitly_wait(5)
        cls.base_url = 'http://127.0.0.1:5000'

    @classmethod
    def tearDownClass(cls):
        # Quit the WebDriver
        cls.driver.quit()

    def login(self, username, password):
        """Helper method to log in a user."""
        self.driver.get(f'{self.base_url}/login')
        self.driver.find_element(By.NAME, 'username').send_keys(username)
        self.driver.find_element(By.NAME, 'password').send_keys(password)
        self.driver.find_element(By.NAME, 'submit').click()

    def test_create_group(self):
        group_name = f"Test Group {uuid.uuid4().hex[:4]}"
        group_about = "This is a test group created via Selenium."

        # Log in as the test user
        self.login(self.test_username, "testpassword")

        # Navigate to group creation page
        self.driver.get(f'{self.base_url}/create_group')

        # Fill in form
        self.driver.find_element(By.NAME, 'name').send_keys(group_name)
        self.driver.find_element(By.NAME, 'about').send_keys(group_about)

        # Submit the form
        self.driver.find_element(By.XPATH, "//button[contains(., 'Create Group')]").click()

        # Check for success — update based on your flash message or redirect
        self.assertIn(group_name, self.driver.page_source)
        self.assertIn("Group created", self.driver.page_source)

    def test_add_member_to_group(self):
        group_name = f"Test Group {uuid.uuid4().hex[:4]}"
        group_about = "This is a test group created via Selenium."

        # Log in as the test user
        self.login(self.test_username, "testpassword")

        # Create a group
        self.driver.get(f'{self.base_url}/create_group')
        self.driver.find_element(By.NAME, 'name').send_keys(group_name)
        self.driver.find_element(By.NAME, 'about').send_keys(group_about)
        self.driver.find_element(By.XPATH, "//button[contains(., 'Create Group')]").click()

        # Navigate to the user page
        self.driver.get(f"{self.base_url}/user/{self.test_username}")


        self.driver.find_element(By.LINK_TEXT, group_name).click()

        # Add a member to the group
        self.driver.find_element(By.NAME, 'add_member').send_keys(self.member_username)
        self.driver.find_element(By.XPATH, "//button[contains(., 'Add Member')]").click()

        # Check for success
        self.assertIn(self.member_username, self.driver.page_source)
        self.assertIn("Member added", self.driver.page_source)

    def test_create_group_post(self):
        group_name = f"Test Group {uuid.uuid4().hex[:4]}"
        group_about = "This is a test group created via Selenium."
        post_content = "This is a test post in the group."

        # Log in as the test user
        self.login(self.test_username, "testpassword")

        # Create a group
        self.driver.get(f'{self.base_url}/create_group')
        self.driver.find_element(By.NAME, 'name').send_keys(group_name)
        self.driver.find_element(By.NAME, 'about').send_keys(group_about)
        self.driver.find_element(By.XPATH, "//button[contains(., 'Create Group')]").click()

        # Navigate to the user and click on group
        self.driver.get(f'{self.base_url}/user')

        # Create a post in the group
        self.driver.find_element(By.NAME, 'post_content').send_keys(post_content)
        self.driver.find_element(By.XPATH, "//button[contains(., 'Post')]").click()

        # Check for success
        self.assertIn(post_content, self.driver.page_source)
        self.assertIn("Post created", self.driver.page_source)


if __name__ == '__main__':
    unittest.main()