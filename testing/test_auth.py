import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
import time
import uuid
from app import app, db

# Run in terminal with command: 
'''
python -m unittest testing.test_auth
'''

class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Set up the Flask app and database
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        with app.app_context():
            db.create_all()

        # Set up the Selenium WebDriver
        cls.driver = webdriver.Chrome()  # Or use Firefox(), etc.
        cls.driver.implicitly_wait(5)
        cls.base_url = 'http://127.0.0.1:5000'

    @classmethod
    def tearDownClass(cls):
        # Quit the WebDriver
        cls.driver.quit()

    def test_login_fail(self):
        self.driver.get(f'{self.base_url}/login')
        self.driver.find_element(By.NAME, 'username').send_keys('invaliduser')
        self.driver.find_element(By.NAME, 'password').send_keys('wrongpass')
        self.driver.find_element(By.NAME, 'submit').click()
        self.assertIn('Invalid username or password', self.driver.page_source)

    def test_register_and_login(self):
        unique_username = f'user_{uuid.uuid4().hex[:6]}'
        unique_email = f'{unique_username}@example.com'
        password = 'TestPass123'

        # Register
        self.driver.get(f'{self.base_url}/register')
        self.driver.find_element(By.NAME, 'username').send_keys(unique_username)
        self.driver.find_element(By.NAME, 'email').send_keys(unique_email)
        self.driver.find_element(By.NAME, 'password').send_keys(password)
        self.driver.find_element(By.NAME, 'password2').send_keys(password)
        self.driver.find_element(By.XPATH, "//button[text()='Register']").click()

        # Confirm registration success
        self.assertIn(f'Account created for {unique_username}!', self.driver.page_source)

        # Login
        self.driver.get(f'{self.base_url}/login')
        self.driver.find_element(By.NAME, 'username').send_keys(unique_username)
        self.driver.find_element(By.NAME, 'password').send_keys(password)
        self.driver.find_element(By.NAME, 'submit').click()

        # Confirm login success
        self.assertIn(f'>Welcome, {unique_username}', self.driver.page_source)
        self.assertIn('Logout', self.driver.page_source)


if __name__ == '__main__':
    unittest.main()