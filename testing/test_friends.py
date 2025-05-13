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
python -m unittest testing.test_friends
'''

class FriendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        with app.app_context():
            db.create_all()

            # Create User A
            cls.user_a_username = f"user_{uuid.uuid4().hex[:6]}"
            user_a = User(username=cls.user_a_username, email=f"{cls.user_a_username}@example.com")
            user_a.set_password("passwordA")
            db.session.add(user_a)

            # Create User B
            cls.user_b_username = f"user_{uuid.uuid4().hex[:6]}"
            user_b = User(username=cls.user_b_username, email=f"{cls.user_b_username}@example.com")
            user_b.set_password("passwordB")
            db.session.add(user_b)

            db.session.commit()

        cls.driver = webdriver.Chrome()
        cls.driver.implicitly_wait(5)
        cls.base_url = 'http://127.0.0.1:5000'

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def login(self, username, password):
        self.driver.get(f'{self.base_url}/login')
        wait = WebDriverWait(self.driver, 10)
        wait.until(EC.presence_of_element_located((By.NAME, 'username'))).send_keys(username)
        self.driver.find_element(By.NAME, 'password').send_keys(password)
        self.driver.find_element(By.NAME, 'submit').click()

    def logout(self):
        self.driver.get(f'{self.base_url}/logout')

    def test_friend_add_accept_remove(self):
        wait = WebDriverWait(self.driver, 10)

        # Step 1: Login as User A and send request to B
        self.login(self.user_a_username, "passwordA")
        self.driver.get(f'{self.base_url}/')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//a[text()='Friends']"))).click()

        wait.until(EC.presence_of_element_located((By.ID, 'search-query')))
        search_input = self.driver.find_element(By.ID, 'search-query')
        search_input.send_keys(self.user_b_username)
        search_input.send_keys(Keys.RETURN)
    
        # Click "Add Friend" next to User B
        wait.until(EC.element_to_be_clickable((By.XPATH, f"//button[contains(text(), 'Send Friend Request')]"))).click()
        self.logout()
        time.sleep(1)

        # Step 2: Login as User B and accept the request
        self.login(self.user_b_username, "passwordB")
        self.driver.get(f'{self.base_url}/')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//a[text()='Friends']"))).click()

        # Accept friend request
        wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='Accept']"))).click()
        self.logout()

        # Step 3: Login again as User A to verify B is friend and remove them
        self.login(self.user_a_username, "passwordA")
        self.driver.get(f'{self.base_url}/')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//a[text()='Friends']"))).click()

        # Remove friend
        wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='Remove']"))).click()

        # Confirm user B is no longer on the friends list
        # Wait for the <ul class="flash-messages"> to appear
        flash_container = wait.until(
            EC.presence_of_element_located((By.CLASS_NAME, "flash-messages"))
        )

        # Get all <li> elements inside the flash container
        flash_items = flash_container.find_elements(By.TAG_NAME, "li")

        # Extract text from each <li>
        flash_texts = [item.text for item in flash_items]

        # Check if expected message is in the list
        expected_message = f"{self.user_b_username} has been removed from your friends list."
        self.assertIn(expected_message, flash_texts)

        # Reload the page to verify the friend is no longer present
        self.driver.refresh()

        # Wait for page to load
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))

        # Confirm the friend username is no longer in the page source
        self.assertNotIn(self.user_b_username, self.driver.page_source)

        # Optional: log out or continue testing
        self.logout()

    def test_friend_reject(self):
        wait = WebDriverWait(self.driver, 10)

        # Step 1: User A sends friend request to User B
        self.login(self.user_a_username, "passwordA")
        self.driver.get(f'{self.base_url}/')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//a[text()='Friends']"))).click()

        wait.until(EC.presence_of_element_located((By.ID, 'search-query')))
        search_input = self.driver.find_element(By.ID, 'search-query')
        search_input.send_keys(self.user_b_username)
        search_input.send_keys(Keys.RETURN)

        wait.until(EC.element_to_be_clickable((By.XPATH, f"//button[contains(text(), 'Send Friend Request')]"))).click()
        self.logout()

        # Step 2: User B logs in and rejects the friend request
        self.login(self.user_b_username, "passwordB")
        self.driver.get(f'{self.base_url}/')
        wait.until(EC.element_to_be_clickable((By.XPATH, "//a[text()='Friends']"))).click()

        wait.until(EC.element_to_be_clickable((By.XPATH, "//input[@type='submit' and @value='Reject']"))).click()

        # Wait for flash message
        flash_container = wait.until(
            EC.presence_of_element_located((By.CLASS_NAME, "flash-messages"))
        )
        flash_items = flash_container.find_elements(By.TAG_NAME, "li")
        flash_texts = [item.text for item in flash_items]

        expected_message = f"Friend request rejected."
        self.assertIn(expected_message, flash_texts)

        # Confirm user A no longer appears in the pending requests
        self.assertNotIn(self.user_a_username, self.driver.page_source)
        self.logout()


if __name__ == '__main__':
    unittest.main()