import math
from app.models.caregiver import Caregiver

def calculate_distance(lat1, lon1, lat2, lon2):
    return math.sqrt((lat1 - lat2)**2 + (lon1 - lon2)**2)

def find_best_caregiver(db, user_lat, user_lon):
    caregivers = (
        db.query(Caregiver)
        .filter(
            Caregiver.is_available == True,
            Caregiver.status == "approved",
            Caregiver.is_enabled == True,
            Caregiver.forced_offline == False,
        )
        .all()
    )
    best = None
    best_score = 999999

    for c in caregivers:
        if c.latitude is None:
            continue

        distance = calculate_distance(user_lat, user_lon, c.latitude, c.longitude)
        rating = c.rating or 0
        experience = c.experience or 0
        score = distance - (rating * 0.1) - (experience * 0.05)

        if score < best_score:
            best_score = score
            best = c

    return best
