from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField, TextAreaField
from wtforms.validators import ValidationError, DataRequired, Email, EqualTo, Length
from app.models import User 

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Sign In')

class RegistrationForm(FlaskForm):
    username = StringField(
        'Username',
        validators=[DataRequired(), Length(min=3, max=64)]
    )
    email = StringField(
        'Email',
        validators=[DataRequired(), Email(), Length(max=64)]
    )
    password = PasswordField(
        'Password',
        validators=[DataRequired(), Length(min=3)] #Modified here (Can change)
    )
    password2 = PasswordField(
        'Confirm Password',
        validators=[DataRequired(), EqualTo('password', message='Passwords must match.')]
    )
    submit = SubmitField('Sign Up')

    def validate_username(self, username): 
        user = User.query.filter_by(username=username.data).first() 
        if user is not None: 
            raise ValidationError('Please use a different username.') 
 
    def validate_email(self, email): 
        user = User.query.filter_by(email=email.data).first() 
        if user is not None: 
            raise ValidationError('Please use a different email address.') 
        
class EditProfileForm(FlaskForm): 
    username = StringField('Username', validators=[DataRequired()]) 
    about_me = TextAreaField('About me', validators=[Length(min=0, max=140)]) 
    submit = SubmitField('Submit')

class EmptyForm(FlaskForm): 
    submit = SubmitField('Submit') 

class PostForm(FlaskForm): 
    post = TextAreaField('Say something', validators=[ 
    DataRequired(), Length(min=1, max=140)]) 
    submit = SubmitField('Submit') 

class CreateGroupForm(FlaskForm):
    name = StringField("Group Name", validators=[DataRequired(), Length(max=100)])
    about = TextAreaField("About", validators=[Length(max=255)])

class MessageForm(FlaskForm): 
    message = TextAreaField(('Message'), validators=[ 
        DataRequired(), Length(min=0, max=140)]) 
    submit = SubmitField('Submit')