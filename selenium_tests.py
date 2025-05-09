from selenium import webdriver
from selenium.webdriver.common.by import By
import time
import uuid

driver = webdriver.Chrome()  # Or use Firefox(), etc.
driver.implicitly_wait(5)

base_url = 'http://127.0.0.1:5000'

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

# Run tests
try:
    test_login_fail()
    test_register_and_login()
    print("Tests passed.")
finally:
    driver.quit()