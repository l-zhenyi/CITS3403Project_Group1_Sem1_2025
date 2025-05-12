from selenium import webdriver
from selenium.webdriver.common.by import By
import time
import uuid
from app import app, db

# Run in terminal with command: 
'''
python -m unittest testing.selenium_tests
'''

with app.app_context():
    db.create_all()

driver = webdriver.Chrome()  # Or use Firefox(), etc.
driver.implicitly_wait(5)

base_url = 'http://127.0.0.1:5000'

#USE IN-MEMORY DATABASE TO SAVE CLEANING UP FILES.
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'


def test_login_fail():
    driver.get(f'{base_url}/login')
    driver.find_element(By.NAME, 'username').send_keys('invaliduser')
    driver.find_element(By.NAME, 'password').send_keys('wrongpass')
    driver.find_element(By.NAME, 'submit').click()
    assert 'Invalid username or password' in driver.page_source

def test_register_and_login():
    unique_username = f'user_{uuid.uuid4().hex[:6]}'
    unique_email = f'{unique_username}@example.com'
    password = 'TestPass123'

    # Register
    driver.get(f'{base_url}/register')
    driver.find_element(By.NAME, 'username').send_keys(unique_username)
    driver.find_element(By.NAME, 'email').send_keys(unique_email)
    driver.find_element(By.NAME, 'password').send_keys(password)
    driver.find_element(By.NAME, 'password2').send_keys(password)
    driver.find_element(By.XPATH, "//button[text()='Register']").click()
    
    # Confirm registration success (you can also redirect to login)
    assert f'Account created for {unique_username}!' in driver.page_source

    # Login
    driver.get(f'{base_url}/login')
    driver.find_element(By.NAME, 'username').send_keys(unique_username)
    driver.find_element(By.NAME, 'password').send_keys(password)
    driver.find_element(By.NAME, 'submit').click()
    
    # Confirm login success (check for greeting or logout link)
    assert f'>Welcome, {unique_username}' in driver.page_source or 'Logout' in driver.page_source

def test_create_group():
    group_name = f"Test Group {uuid.uuid4().hex[:4]}"
    group_about = "This is a test group created via Selenium."

    # Navigate to group creation page
    driver.get(f'{base_url}/create_group')

    # Fill in form
    driver.find_element(By.NAME, 'name').send_keys(group_name)
    driver.find_element(By.NAME, 'about').send_keys(group_about)

    # Submit the form
    driver.find_element(By.XPATH, "//button[contains(., 'Create Group')]").click()

    # Check for success — update based on your flash message or redirect
    assert group_name in driver.page_source or "Group created" in driver.page_source

def test_send_message():
    # Create two users: sender and recipient
    sender = f"alice_{uuid.uuid4().hex[:4]}"
    recipient = f"bob_{uuid.uuid4().hex[:4]}"
    password = "Test123!"

    # Register both users
    for user in [sender, recipient]:
        driver.get(f"{base_url}/register")
        driver.find_element(By.NAME, 'username').send_keys(user)
        driver.find_element(By.NAME, 'email').send_keys(f"{user}@test.com")
        driver.find_element(By.NAME, 'password').send_keys(password)
        driver.find_element(By.NAME, 'password2').send_keys(password)
        driver.find_element(By.XPATH, "//button[contains(., 'Register')]").click()

        # Logout after registration
        if "Logout" in driver.page_source:
            driver.find_element(By.LINK_TEXT, "Logout").click()

    # Log in as sender
    driver.get(f"{base_url}/login")
    driver.find_element(By.NAME, 'username').send_keys(sender)
    driver.find_element(By.NAME, 'password').send_keys(password)
    driver.find_element(By.XPATH, "//button[contains(., 'Sign In')]").click()

    # Go to recipient's message page
    driver.get(f"{base_url}/message/{recipient}")

    # Send a message
    test_message = "Hello from Selenium!"
    driver.find_element(By.NAME, 'message').send_keys(test_message)
    driver.find_element(By.XPATH, "//button[contains(., 'Submit')]").click()

    # Verify message is sent — adjust based on your flash/message UI
    assert "Message sent" in driver.page_source or test_message in driver.page_source

# Run tests
try:
    test_login_fail()
    test_register_and_login()
    test_create_group()
    test_send_message()
    print("Tests passed.")
finally:
    driver.quit()