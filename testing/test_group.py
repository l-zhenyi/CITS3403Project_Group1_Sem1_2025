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

# Scenario: 
# You create a new group and add a friend as a member.
# You post in the group. The group member, your friend, can see the post.
# The group member, your friend, can also post in the group.
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

        cls.driver = webdriver.Chrome()  # Or use Firefox(), etc.
        cls.driver.implicitly_wait(5)
        cls.base_url = 'http://127.0.0.1:5000'

        # Step 1: Set up the group_name here so it's available for all test methods
        cls.group_name = f"Test Group {uuid.uuid4().hex[:4]}"  # Generate the group name
        cls.group_about = "This is a test group created via Selenium."

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def login(self, username, password):
        """Helper method to log in a user."""
        self.driver.get(f'{self.base_url}/login')
        wait = WebDriverWait(self.driver, 10)
        username_field = wait.until(EC.presence_of_element_located((By.NAME, 'username')))
        username_field.send_keys(username)
        self.driver.find_element(By.NAME, 'password').send_keys(password)
        self.driver.find_element(By.NAME, 'submit').click()

    def test_create_group_and_add_member(self):
        """Create a group and add a member."""
        wait = WebDriverWait(self.driver, 10)
        group_name = self.group_name  # Use the class attribute
        group_about = self.group_about  # Use the class attribute

        # Step 1: Log in as the test user
        self.driver.get(f'{self.base_url}/login')
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

        time.sleep(2) # FireFox test won't work unless it has this
        
        # Step 5: Wait for the group page to load by checking for the group name in <h2>
        wait.until(EC.presence_of_element_located((By.TAG_NAME, 'h2')))
        group_header = self.driver.find_element(By.TAG_NAME, 'h2')

        # Step 6: Confirm the group name and the presence of "Add Members" link
        self.assertEqual(group_header.text, group_name)

        # After group creation, extract the group_id
        current_url = self.driver.current_url
        self.group_id = int(current_url.rstrip('/').split('/')[-1])

        # Step 7: Add member to the group
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

        # Step 8: Post in the group as the test user
        self.driver.get(f"{self.base_url}/groups/{self.group_id}")
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, 'message-input-box')))
        post_content = "This is a test post for the group."
        post_input = self.driver.find_element(By.NAME, "post")
        post_input.send_keys(post_content)
        # Wait for the "Send" button to be clickable
        # Wait for the button to be present and clickable
        end_button = WebDriverWait(self.driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[@type='submit' and contains(text(), 'Send')]"))
        )

        # Scroll into view
        self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", end_button)

        # Optionally wait a bit for animation/visibility if needed
        WebDriverWait(self.driver, 2).until(EC.visibility_of(end_button))

        # Click the button
        end_button.click()

        # Wait for the post to appear in the feed
        wait.until(EC.presence_of_element_located((By.XPATH, f"//*[contains(text(), '{post_content}')]")))
        time.sleep(2)
        self.driver.get(f'{self.base_url}/logout')

        self.driver.get(f'{self.base_url}/login')

        wait.until(EC.presence_of_element_located((By.NAME, "username")))

    def test_member_user_access_and_post_in_group(self):
        wait = WebDriverWait(self.driver, 10)

        # Step 1: Log in as member_user
        self.driver.get(f'{self.base_url}/login')
        self.login(self.member_username, "memberpassword")

        # Step 2: Navigate to profile and click on the group link
        self.driver.get(f'{self.base_url}/')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//a[text()='Profile']"))).click()

        # Step 3: Find the group with the group_name (using the group name to find the group link)
        group_name = self.group_name  # Use the class attribute

        # XPath expression to locate the group by its name in the <a> tag inside <h3>
        group_link_xpath = f"//h3/a[contains(text(), '{group_name}')]"
        group_link = wait.until(EC.element_to_be_clickable((By.XPATH, group_link_xpath)))

        # Step 4: Click the group link to access the group page
        group_link.click()


        # Step 6: Verify the post made by the test user appears in the feed
        post_content = "This is a test post for the group."
        time.sleep(2)
        try:
            # Wait until the post content is inside a message-body
            post_element = wait.until(EC.presence_of_element_located(
                (By.XPATH, f"//div[@class='message-body'][contains(text(), '{post_content}')]")
            ))

            # Scroll it into view using JavaScript
            self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", post_element)

            # Now assert it contains the expected text
            self.assertIn(post_content, post_element.text)


        except Exception as e:
            self.fail(f"Post with content '{post_content}' was not found: {e}")

        # Step 7: Make a post as member_user
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, 'message-input-box')))
        post_content_member = "This is a member post for the group."
        post_input = self.driver.find_element(By.NAME, "post")
        post_input.send_keys(post_content_member)  

        send_button2 = WebDriverWait(self.driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[@type='submit' and contains(text(), 'Send')]"))
        )

        # Scroll the "Send" button into view
        self.driver.execute_script("arguments[0].scrollIntoView(true);", send_button2)

        # Optionally, you can add a small delay to ensure the button is fully in view before clicking
        # Click the "Send" button
        send_button2.click()

        # Wait for the post to appear in the feed
        wait.until(EC.presence_of_element_located((By.XPATH, f"//*[contains(text(), '{post_content_member}')]")))

        # Step 8: Verify member's post appears in the group feed
        try:
            post_element_member = wait.until(EC.presence_of_element_located(
                (By.XPATH, f"//div[@class='message-body'][contains(text(), '{post_content_member}')]")))
            self.assertIn(post_content_member, post_element_member.text)
        except Exception as e:
            self.fail(f"New post '{post_content_member}' not found after posting: {e}")
      
if __name__ == '__main__':
    unittest.main(verbosity=2)