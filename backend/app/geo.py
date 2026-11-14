"""Store distance. Location is used only for a check-in decision, never sent to a model."""

from math import asin, cos, radians, sin, sqrt


def haversine_m(lat1, lng1, lat2, lng2) -> float:
    radius = 6_371_000
    lat1, lng1, lat2, lng2 = (radians(value) for value in (lat1, lng1, lat2, lng2))
    dlat, dlng = lat2 - lat1, lng2 - lng1
    chord = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * radius * asin(sqrt(chord))


def within_geofence(distance_m, radius_m, accuracy_m) -> bool:
    tolerance = min(max(float(accuracy_m or 0), 0), 100)
    return distance_m <= float(radius_m) + tolerance


def admission(active, capacity, waiting, max_queue) -> str:
    """Per-store floor decision. One store being full does not change another store's counts."""
    if active < capacity:
        return "active"
    if waiting < max_queue:
        return "queue_waiting"
    return "full"
