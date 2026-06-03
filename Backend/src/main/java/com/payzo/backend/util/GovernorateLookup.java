package com.payzo.backend.util;

import java.util.Map;

/**
 * Static coordinate map for 24 Tunisian governorates + haversine distance.
 * Coordinates match ML-Service/train/governorates.py exactly.
 */
public final class GovernorateLookup {

    private GovernorateLookup() {}

    private static final double EARTH_RADIUS_KM = 6371.0;

    private static final Map<String, double[]> COORDS = Map.ofEntries(
            Map.entry("Tunis",       new double[]{36.8065, 10.1815}),
            Map.entry("Ariana",      new double[]{36.8663, 10.1645}),
            Map.entry("Ben Arous",   new double[]{36.7533, 10.2281}),
            Map.entry("Manouba",     new double[]{36.8101, 10.0863}),
            Map.entry("Nabeul",      new double[]{36.4561, 10.7376}),
            Map.entry("Zaghouan",    new double[]{36.4029, 10.1429}),
            Map.entry("Bizerte",     new double[]{37.2744, 9.8739}),
            Map.entry("Beja",        new double[]{36.7256, 9.1817}),
            Map.entry("Jendouba",    new double[]{36.5011, 8.7802}),
            Map.entry("Le Kef",      new double[]{36.1826, 8.7148}),
            Map.entry("Siliana",     new double[]{36.0850, 9.3708}),
            Map.entry("Sousse",      new double[]{35.8254, 10.6360}),
            Map.entry("Monastir",    new double[]{35.7643, 10.8113}),
            Map.entry("Mahdia",      new double[]{35.5047, 11.0622}),
            Map.entry("Sfax",        new double[]{34.7406, 10.7603}),
            Map.entry("Kairouan",    new double[]{35.6781, 10.0963}),
            Map.entry("Kasserine",   new double[]{35.1722, 8.8308}),
            Map.entry("Sidi Bouzid", new double[]{34.8888, 9.4843}),
            Map.entry("Gabes",       new double[]{33.8815, 10.0982}),
            Map.entry("Medenine",    new double[]{33.3540, 10.5055}),
            Map.entry("Tataouine",   new double[]{32.9297, 10.4518}),
            Map.entry("Gafsa",       new double[]{34.4250, 8.7842}),
            Map.entry("Tozeur",      new double[]{33.9197, 8.1335}),
            Map.entry("Kebili",      new double[]{33.7072, 8.9710})
    );

    public static double haversineKm(String gov1, String gov2) {
        if (gov1 == null || gov2 == null) return 0.0;
        double[] c1 = COORDS.get(gov1);
        double[] c2 = COORDS.get(gov2);
        if (c1 == null || c2 == null) return 0.0;

        double lat1 = Math.toRadians(c1[0]);
        double lon1 = Math.toRadians(c1[1]);
        double lat2 = Math.toRadians(c2[0]);
        double lon2 = Math.toRadians(c2[1]);

        double dlat = lat2 - lat1;
        double dlon = lon2 - lon1;
        double a = Math.sin(dlat / 2) * Math.sin(dlat / 2)
                 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) * Math.sin(dlon / 2);
        return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
    }

    public static boolean isValid(String governorate) {
        return governorate != null && COORDS.containsKey(governorate);
    }
}
