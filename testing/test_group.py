import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
import uuid, time
from app import app, db
from app.models import User

# Run in terminal with command: 
'''
python -m unittest testing.test_group
'''

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

            # Users become friends
            test_user.add_friend(member_user) 
            member_user.add_friend(test_user)  
            db.session.commit()

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

    def test_create_group_and_add_member(self):
        wait = WebDriverWait(self.driver, 10)
        group_name = f"Test Group {uuid.uuid4().hex[:4]}"
        group_about = "This is a test group created via Selenium."
        member_username = "testmember"  # Username of the member you want to add (modify as necessary)

        # Step 1: Log in
        self.login(self.test_username, "testpassword")

        # Step 2: Go to user profile and navigate to the create group page
        self.driver.get(f'{self.base_url}/')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//a[text()='Profile']"))).click()

        # Step 3: Click "Create a new group"
        wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Create a new group"))).click()

        # Step 4: Fill out and submit the form
        wait.until(EC.presence_of_element_located((By.NAME, 'name'))).send_keys(group_name)
        self.driver.find_element(By.NAME, 'about').send_keys(group_about)
        form = self.driver.find_element(By.TAG_NAME, 'form')
        form.submit()

        # Step 5: Wait for the group page to load by checking for the group name in <h2>
        wait.until(EC.presence_of_element_located((By.TAG_NAME, 'h2')))
        group_header = self.driver.find_element(By.TAG_NAME, 'h2')

        # Step 6: Confirm the group name and the presence of "Add Members" link
        self.assertEqual(group_header.text, group_name)

        # After group creation
        wait.until(EC.presence_of_element_located((By.TAG_NAME, 'h2')))
        current_url = self.driver.current_url

        # Extract the group_id from the URL
        self.group_id = int(current_url.rstrip('/').split('/')[-1])
                
        # Locate the "Add Members" link by its text or href
        try:
            # Use XPath to locate the link with "Add Members" text or href attribute
            add_members_link = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//a[contains(text(), 'Add Members') or contains(@href, 'add_members')]")
            ))
            add_members_link.click()
        except Exception as e:
            print("Failed to click 'Add Members' button. Error:", e)

        # Step 8: Wait for the friends list to load and search for the member
        wait.until(EC.presence_of_element_located((By.ID, 'friend-search')))
        search_input = self.driver.find_element(By.ID, 'friend-search')
        search_input.send_keys(self.member_username)

        # Step 9: Wait for the specific member to appear in the search results
        wait.until(EC.presence_of_element_located((By.XPATH, f"//span[text()='{self.member_username}']")))

        # Correct XPath: locate the form that contains the hidden input with the friend's username
        form_xpath = f"//form[@action='/group/{self.group_id}/add_members'][.//input[@type='hidden' and @value='{self.member_username}']]"
        form = wait.until(EC.presence_of_element_located((By.XPATH, form_xpath)))

        # Then click the button inside that form
        submit_button = form.find_element(By.XPATH, ".//button[@type='submit']")
        submit_button.click()

        time.sleep(2) 
                
        try:
            self.assertIn(self.member_username, self.driver.page_source)
        except Exception as e:
            self.fail(f"New group member {self.member_username} not found on page after adding: {e}")

        # Step 10: Post in the group
        self.driver.get(f"{self.base_url}/groups/{self.group_id}")  # Make sure this URL is correct
        
        # Step 11: Wait until the post form is visible
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, 'message-input-box')))

        # Step 12: Find the post form and the input field
        post_input = self.driver.find_element(By.NAME, "post")

        # Step 13: Fill in the post content
        post_content = "This is a test post for the group."
        post_input.send_keys(post_content)

        # Step 14: Locate and click the "Send" button
        send_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[@type='submit' and contains(text(), 'Send')]")))
        send_button.click()

        # Step 15: Wait for the page to refresh or the post to appear in the feed
        wait.until(EC.presence_of_element_located((By.XPATH, f"//*[contains(text(), '{post_content}')]")))

        # Step 16: Verify that the post has appeared on the page
        try:
            post_element = self.driver.find_element(By.XPATH, f"//*[contains(text(), '{post_content}')]")
            self.assertIn(post_content, post_element.text)
        except Exception as e:
            self.fail(f"Failed to find the new post in the group feed: {e}")
            
if __name__ == '__main__':
    unittest.main()