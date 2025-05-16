import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import uuid
from app import app, db

# Run in terminal with command:
'''
python -m unittest testing.test_auth
'''

# Scenario:
# You forget to register and try to login.
# Hence, you remember to register an account and login.
class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Set up the Flask app and database
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        with app.app_context():
            db.create_all()

        # Set up the Selenium WebDriver
        options = webdriver.ChromeOptions()
        # Uncomment the next line to run Chrome in headless mode (without opening a browser window)
        # options.add_argument('--headless')
        # options.add_argument('--disable-gpu') # Optional, recommended for headless on Windows
        # options.add_argument('--no-sandbox') # Optional, may be needed in some environments
        # options.add_argument('--disable-dev-shm-usage') # Optional, overcome limited resource problems
        cls.driver = webdriver.Chrome(options=options)
        cls.driver.implicitly_wait(5)
        cls.base_url = 'http://127.0.0.1:5000' # Ensure your Flask app is running on this address and port

    @classmethod
    def tearDownClass(cls):
        # Quit the WebDriver
        cls.driver.quit()

    def test_login_fail(self):
        self.driver.get(f'{self.base_url}/login')
        wait = WebDriverWait(self.driver, 10) # Define wait here for consistency
        wait.until(EC.presence_of_element_located((By.NAME, 'username'))).send_keys('invaliduser')
        self.driver.find_element(By.NAME, 'password').send_keys('wrongpass')
        self.driver.find_element(By.NAME, 'submit').click()
        
        # Wait for flash message to appear and assert its content
        flash_message = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '.flash-messages li')))
        self.assertIn('Invalid username or password', flash_message.text)
        # Additionally, check if it's in the page source for good measure, though visibility check is stronger
        self.assertIn('Invalid username or password', self.driver.page_source)


    def test_register_and_login(self):
        wait = WebDriverWait(self.driver, 10)
        unique_username = f'user_{uuid.uuid4().hex[:6]}'
        unique_email = f'{unique_username}@example.com'
        password = 'TestPass123'

        # Register
        self.driver.get(f'{self.base_url}/register')
        wait.until(EC.presence_of_element_located((By.NAME, 'username'))).send_keys(unique_username)
        self.driver.find_element(By.NAME, 'email').send_keys(unique_email)
        self.driver.find_element(By.NAME, 'password').send_keys(password)
        self.driver.find_element(By.NAME, 'password2').send_keys(password)
        self.driver.find_element(By.XPATH, "//button[text()='Register']").click()

        # Wait for registration success message
        flash_message_register = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '.flash-messages li')))
        expected_register_message = f'Account created for {unique_username}!'
        self.assertIn(expected_register_message, flash_message_register.text)
        self.assertIn(expected_register_message, self.driver.page_source)


        # Login
        self.driver.get(f'{self.base_url}/login')
        wait.until(EC.presence_of_element_located((By.NAME, 'username'))).send_keys(unique_username)
        self.driver.find_element(By.NAME, 'password').send_keys(password)
        self.driver.find_element(By.NAME, 'submit').click()

        # Wait for the welcome message to appear on the home page (assuming it's an h1)
        # If your welcome message is not an h1, adjust the locator
        welcome_header = wait.until(
            EC.visibility_of_element_located((By.XPATH, f"//h1[contains(text(), 'Welcome, {unique_username}')]"))
        )
        # Confirm it displays the expected greeting
        self.assertIn(f"Welcome, {unique_username}", welcome_header.text.strip())

        # MODIFIED ASSERTION: Check for the presence and visibility of the Logout link/icon
        # This targets the <a> tag with aria-label="Logout", which should be present for the icon
        logout_element = wait.until(
            EC.visibility_of_element_located((By.XPATH, "//a[@aria-label='Logout']"))
        )
        self.assertTrue(logout_element.is_displayed(), "Logout link/icon not found or not visible after login")


if __name__ == '__main__':
    unittest.main(verbosity=2)