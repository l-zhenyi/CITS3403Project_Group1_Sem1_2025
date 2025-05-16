# Plannit
#### Created for CITS3403 Semester 1 2025
## Application Purpose, Use and Design
Our all-in-one platform empowers you to stay connected and organized with ease. Add friends, create and manage groups, share posts, send direct messages, plan events, and track shared expenses — all in one seamless experience. Whether for personal use or group coordination, our app brings clarity, convenience, and connection to every interaction.

## Group Members
| UWA ID  | Name | Github username |
| ----------- | ----------- | ----------- |
| 24263238 | Zhen Yi Lim | l-zhenyi |
| 23808128 | Ziye Xie | ziye0226 |
| 23970936 | Jacob Read | Consumer-of-Souls |
| 23737821 | Aidan Kirby-Smith | Aidan-KS |

## Installation and running 
#### Prerequisites
Python

#### **Add the following to a .flaskenv file**
```
FLASK_APP=run.py
FLASK_ENV=development
SECRET_KEY='<SOME SECRET KEY OF YOUR CHOOSING>'
```

Open a terminal in the project directory and run following commands:
#### On Windows
```
python3 -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
flask db upgrade
```
#### On Linux/MacOS
```
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
flask db upgrade
```

#### Run app with
```
flask run
```
By default, the application runs on http://127.0.0.1:5000. Check your console output for the exact URL.

#### To deactivate the virtual environment, enter:
```
deactivate
```


## Running tests
### Python Models test
In the project root dictionary, run:
```
python -m unittest testing.test_models
```

### Selenium tests
Open the first terminal. In the project root dictionary, run:
 ```
flask run
```
Open a second terminal. In the project root dictionary, run these commands one at a time and observe the Selenium tests:
```
python -m unittest testing.test_auth
python -m unittest testing.test_friends
python -m unittest testing.test_group
python -m unittest testing.test_messages
```
