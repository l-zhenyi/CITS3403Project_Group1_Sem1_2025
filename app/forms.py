from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
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
        validators=[DataRequired(), Length(min=6)]
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