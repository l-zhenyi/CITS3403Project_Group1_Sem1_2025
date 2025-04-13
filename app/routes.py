from flask import render_template
from app import app

groups = [
    {
        'id': 'hikers',
        'name': 'Weekend Hikers',
        'avatar_url': 'https://via.placeholder.com/40/A0AECF/FFFFFF?text=G1',
        'upcoming_event_count': 2, # Example calculation
        'events': [
            {
                'id': 1,
                'title': 'Mountain Hike Day',
                'image_url': 'https://via.placeholder.com/150/BEE3F8/2A4365?text=Hike+Img',
                'date_iso': '2023-11-25T09:00:00', # ISO format for JS parsing
                'formatted_date': 'Sat, Nov 25 @ 9:00 AM', # Pre-formatted for display
                'cost_display': '$5',
                'location': 'Eagle Peak Trail',
                'rsvp_status': 'Going'
            },
            {
                'id': 5,
                'title': 'Coastal Trail Walk',
                'image_url': 'https://via.placeholder.com/150/A0AECF/FFFFFF?text=Walk+Img',
                'date_iso': '2023-12-02T10:00:00',
                'formatted_date': 'Sat, Dec 2 @ 10:00 AM',
                'cost_display': 'Free',
                'location': 'Seaview Path',
                'rsvp_status': 'Invited'
            },
             { # Example Past Event for filtering
                'id': 8,
                'title': 'Previous Hike Prep Meeting',
                'image_url': 'https://via.placeholder.com/150/A0AECF/999999?text=Past+Hike',
                'date_iso': '2023-10-15T19:00:00',
                'formatted_date': 'Sun, Oct 15 @ 7:00 PM',
                'cost_display': 'Free',
                'location': 'Online',
                'rsvp_status': 'Going'
            },
        ]
    },
    {
        'id': 'boardgames',
        'name': 'Board Game Geeks',
        'avatar_url': 'https://via.placeholder.com/40/FEEBC8/9C4221?text=G2',
        'upcoming_event_count': 1,
        'events': [
            # ... events for board game geeks ...
        ]
    },
    # ... more groups
]

@app.route('/')
def index():
    return render_template('mainpage.html', groups=groups)