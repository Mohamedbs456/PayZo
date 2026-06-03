"""Tunisian governorate coordinates and haversine distance.

Identical to the Java side (`GovernorateLookup.java`) and to the legacy
`train/governorates.py` it supersedes. 24 governorates with (lat, lon).
"""

import math

GOVERNORATE_COORDS: dict[str, tuple[float, float]] = {
    "Tunis":      (36.8065, 10.1815),
    "Ariana":     (36.8663, 10.1645),
    "Ben Arous":  (36.7533, 10.2281),
    "Manouba":    (36.8101, 10.0863),
    "Nabeul":     (36.4561, 10.7376),
    "Zaghouan":   (36.4029, 10.1429),
    "Bizerte":    (37.2744, 9.8739),
    "Beja":       (36.7256, 9.1817),
    "Jendouba":   (36.5011, 8.7802),
    "Le Kef":     (36.1826, 8.7148),
    "Siliana":    (36.0850, 9.3708),
    "Sousse":     (35.8254, 10.6360),
    "Monastir":   (35.7643, 10.8113),
    "Mahdia":     (35.5047, 11.0622),
    "Sfax":       (34.7406, 10.7603),
    "Kairouan":   (35.6781, 10.0963),
    "Kasserine":  (35.1722, 8.8308),
    "Sidi Bouzid":(34.8888, 9.4843),
    "Gabes":      (33.8815, 10.0982),
    "Medenine":   (33.3540, 10.5055),
    "Tataouine":  (32.9297, 10.4518),
    "Gafsa":      (34.4250, 8.7842),
    "Tozeur":     (33.9197, 8.1335),
    "Kebili":     (33.7072, 8.9710),
}

GOVERNORATE_NAMES: list[str] = list(GOVERNORATE_COORDS.keys())

# Population weighting (2014 census, normalized) — drives realistic user
# governorate distribution. Tunis/Sfax/Sousse dominate.
GOVERNORATE_POPULATION_WEIGHTS: dict[str, float] = {
    "Tunis":      0.099, "Sfax":       0.090, "Nabeul":     0.075,
    "Ariana":     0.054, "Ben Arous":  0.058, "Sousse":     0.064,
    "Bizerte":    0.052, "Kairouan":   0.052, "Medenine":   0.044,
    "Gafsa":      0.033, "Monastir":   0.052, "Jendouba":   0.038,
    "Mahdia":     0.038, "Kasserine":  0.041, "Sidi Bouzid":0.039,
    "Beja":       0.029, "Le Kef":     0.022, "Manouba":    0.035,
    "Gabes":      0.035, "Siliana":    0.020, "Tataouine":  0.014,
    "Tozeur":     0.009, "Kebili":     0.014, "Zaghouan":   0.018,
}

# Long-distance pairs for TAKEOVER archetype injection.
LONG_DISTANCE_PAIRS: list[tuple[str, str]] = [
    ("Tunis", "Tataouine"),
    ("Bizerte", "Medenine"),
    ("Ariana", "Tozeur"),
    ("Sousse", "Tataouine"),
    ("Tunis", "Kebili"),
    ("Sfax", "Le Kef"),
    ("Nabeul", "Tozeur"),
    ("Monastir", "Tataouine"),
]

_EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = (math.radians(v) for v in (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return _EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def governorate_distance(gov1: str | None, gov2: str | None) -> float:
    if gov1 is None or gov2 is None:
        return 0.0
    c1 = GOVERNORATE_COORDS.get(gov1)
    c2 = GOVERNORATE_COORDS.get(gov2)
    if c1 is None or c2 is None:
        return 0.0
    return haversine_km(c1[0], c1[1], c2[0], c2[1])
