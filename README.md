# Application Purpose, Use and Design
The purpose of this web application is to help users efficiently manage and split group expenses. Whether for shared housing, 
group trips, or social gatherings, this platform allows users to easily track and manage their collective financial contributions. 
It streamlines the process of calculating how much each individual owes or is owed, ensuring that no one is left in the dark when 
it comes to splitting costs fairly.

# Group Members
| UWA ID  | Name | Github username |
| ----------- | ----------- | ----------- |
| 24263238 | Zhen Yi Lim | l-zhenyi |
| 23808128 | Ziye Xie | ziye0226 |
| 23970936 | Jacob Read | Consumer-of-Souls |
| 23737821 | Aidan Kirby-Smith | Aidan-KS |

# Installation and running 
```
python3 -m venv venv

# If using MacOS or Linux
source venv/bin/activate
# If using Winddows
venv/Scripts/activate

pip install -r requirements.txt
flask db upgrade
flask run
```

#### **You should also have these in a .flaskenv file**
```
FLASK_APP=run.py
FLASK_ENV=development
SECRET_KEY=<SOME SECRET KEY OF YOUR CHOOSING>
```
