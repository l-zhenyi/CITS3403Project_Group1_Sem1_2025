import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
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
        
        # Wait for the username field to be visible
        wait = WebDriverWait(self.driver, 10)
        username_field = wait.until(EC.presence_of_element_located((By.NAME, 'username')))
        
        username_field.send_keys(username)
        self.driver.find_element(By.NAME, 'password').send_keys(password)
        self.driver.find_element(By.NAME, 'submit').click()

    def test_create_group(self):
        wait = WebDriverWait(self.driver, 10)
        group_name = f"Test Group {uuid.uuid4().hex[:4]}"
        group_about = "This is a test group created via Selenium."

        # Step 1: Log in
        self.driver.get(f'{self.base_url}/login')
        self.driver.find_element(By.NAME, 'username').send_keys(self.test_username)
        self.driver.find_element(By.NAME, 'password').send_keys("testpassword")
        self.driver.find_element(By.NAME, 'submit').click()

        # Step 2: Go to user profile via "Profile" link
        self.driver.get(f'{self.base_url}/')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//a[text()='Profile']"))).click()

        # Step 3: Click "Create Group"
        wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Create a new group"))).click()

        # Step 4: Fill out and submit the form
        wait.until(EC.presence_of_element_located((By.NAME, 'name'))).send_keys(group_name)
        self.driver.find_element(By.NAME, 'about').send_keys(group_about)
        # Wait for the "Create Group" button to be clickable and click it using XPath
        # self.driver.find_element(By.XPATH, "//button[contains(text(), 'Create Group')]").click()
        form = self.driver.find_element(By.TAG_NAME, 'form')
        form.submit()


        # Step 5: Wait for the page to load after the redirect (check for the group name)
        # Explicitly wait for the group name in <h2> tag to confirm successful redirection
        wait.until(EC.presence_of_element_located((By.TAG_NAME, 'h2')))
        group_header = self.driver.find_element(By.TAG_NAME, 'h2')

        # Step 6: Confirm that the group name is visible on the view_group page
        self.assertEqual(group_header.text, group_name)

        # Optionally: Check for the "Add Members" button to ensure the correct page loaded
        self.assertTrue(self.driver.find_element(By.LINK_TEXT, "Add Members").is_displayed())


    # def test_add_member_to_group(self):
    #     wait = WebDriverWait(self.driver, 10)
    #     group_name = f"Test Group {uuid.uuid4().hex[:4]}"
    #     group_about = "This is a test group created via Selenium."

    #     self.login(self.test_username, "testpassword")

    #     self.driver.get(f'{self.base_url}/create_group')
    #     wait.until(EC.presence_of_element_located((By.NAME, 'name'))).send_keys(group_name)
    #     self.driver.find_element(By.NAME, 'about').send_keys(group_about)
    #     wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Create Group')]"))).click()

    #     self.driver.get(f"{self.base_url}/user/{self.test_username}")
    #     wait.until(EC.element_to_be_clickable((By.LINK_TEXT, group_name))).click()

    #     wait.until(EC.presence_of_element_located((By.NAME, 'add_member'))).send_keys(self.member_username)
    #     wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Add Member"))).click()

    #     wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, 'body'), self.member_username))
    #     self.assertIn("Member added", self.driver.page_source)

    # def test_create_group_post(self):
    #     group_name = f"Test Group {uuid.uuid4().hex[:4]}"
    #     group_about = "This is a test group created via Selenium."
    #     post_content = "This is a test post in the group."

    #     # Log in as the test user
    #     self.login(self.test_username, "testpassword")

    #     # Create a group
    #     self.driver.get(f'{self.base_url}/create_group')
    #     self.driver.find_element(By.NAME, 'name').send_keys(group_name)
    #     self.driver.find_element(By.NAME, 'about').send_keys(group_about)
    #     self.driver.find_element(By.XPATH, "//button[contains(., 'Create Group')]").click()

    #     # Navigate to the user and click on group
    #     self.driver.get(f'{self.base_url}/user')

    #     # Create a post in the group
    #     self.driver.find_element(By.NAME, 'post_content').send_keys(post_content)
    #     self.driver.find_element(By.XPATH, "//button[contains(., 'Post')]").click()

    #     # Check for success
    #     self.assertIn(post_content, self.driver.page_source)
    #     self.assertIn("Post created", self.driver.page_source)


if __name__ == '__main__':
    unittest.main()