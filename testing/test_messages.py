import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import uuid, time
from app import app, db
from app.models import User

# Run in terminal with command: 
'''
python -m unittest testing.test_message
'''

class MessageFlowTests(unittest.TestCase):
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

            # Make them friends
            user_a.add_friend(user_b)
            user_b.add_friend(user_a)

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

    def test_message_flow_from_profile(self):
        wait = WebDriverWait(self.driver, 10)
        message_text = "Hello from User A to User B!"

        # Step 1: Log in as User A
        self.login(self.user_a_username, "passwordA")

        # Step 2: Click on "Friends" link in the navbar
        friends_nav_link = wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Friends")))
        friends_nav_link.click()

        # Step 3: Search for User B
        search_input = wait.until(EC.presence_of_element_located((By.ID, "friend-search")))
        search_input.send_keys(self.user_b_username)

        # Step 4: Click on User B's username link from filtered list
        wait.until(EC.element_to_be_clickable((By.LINK_TEXT, self.user_b_username))).click()

        # Step 5: On User B's profile, click "Message"
        wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Send Message"))).click()

        # Step 6: Type and send a message
        message_input = wait.until(EC.presence_of_element_located((By.NAME, "message")))
        message_input.send_keys(message_text)
        self.driver.find_element(By.XPATH, "//input[@type='submit' and contains(@class, 'btn-primary')]").click()

        # Step 7: Confirm message is visible

        flash_container = wait.until(
            EC.presence_of_element_located((By.CLASS_NAME, "flash-messages"))
        )

        # Get all <li> elements inside the flash container
        flash_items = flash_container.find_elements(By.TAG_NAME, "li")

        # Extract text from each <li>
        flash_texts = [item.text for item in flash_items]

        # Check if expected message is in the list
        expected_message = f"Your message has been sent."
        self.assertIn(expected_message, flash_texts)

        # Step 8: Log out
        self.logout()

        # Step 9: Log in as User B
        self.login(self.user_b_username, "passwordB")

        # Step 10: Go to Messages tab
        self.driver.get(f'{self.base_url}/messages')

        time.sleep(1) # So _I_ can also see the message. I'm not a robot.

        # Step 12: Verify message is present
        try:
            received_message = wait.until(EC.presence_of_element_located(
                (By.XPATH, f"//div[@class='message-body' and contains(text(), '{message_text}')]")
            ))
            self.assertIn(message_text, received_message.text)
        except Exception as e:
            self.fail(f"Message not found in User B’s inbox: {e}")
        
if __name__ == '__main__':
    unittest.main(verbosity=2)