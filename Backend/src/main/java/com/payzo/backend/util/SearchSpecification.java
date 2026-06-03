package com.payzo.backend.util;

import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.springframework.data.jpa.domain.Specification;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Generic full-row search builder used by the BO list pages
 * (Clients, Staff, Banks, Transactions, Fraud Alerts, etc.).
 *
 * <p>Every field is matched with a case-insensitive LIKE on the column's
 * text form. Hibernate 6's {@code path.as(String.class)} compiles to a
 * proper {@code CAST(col AS varchar)} on Postgres, so String columns,
 * UUID columns, and enum columns can all live in the same field list
 * without per-type branching.
 *
 * <p>Dotted field names traverse relationships, e.g. {@code "client.email"}
 * walks the {@code client} association to its {@code email} column.
 *
 * <p>Filters are an AND of equality predicates layered over the LIKE
 * group — e.g. {@code Map.of("status", UserStatus.PENDING)} narrows the
 * search to a single row status.
 */
public class SearchSpecification {

    /** Primary overload — search every listed field via LIKE on its text form. */
    public static <T> Specification<T> build(String query,
                                              String[] searchFields,
                                              Map<String, Object> filters) {
        return (root, cq, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            if (query != null && !query.isBlank()) {
                String needle = "%" + query.toLowerCase() + "%";
                List<Predicate> ors = new ArrayList<>(searchFields.length);
                for (String f : searchFields) {
                    Path<?> path = resolvePath(root, f);
                    ors.add(cb.like(cb.lower(path.as(String.class)), needle));
                }
                if (!ors.isEmpty()) {
                    predicates.add(cb.or(ors.toArray(new Predicate[0])));
                }
            }

            filters.forEach((field, value) -> {
                if (value != null) {
                    predicates.add(cb.equal(resolvePath(root, field), value));
                }
            });

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * Compatibility overload — accepts a separate {@code uuidFields} array
     * for legacy callers. UUID and String fields are now handled identically
     * (both via {@code path.as(String.class)}), so the two arrays are
     * concatenated and the same primary path runs.
     */
    public static <T> Specification<T> build(String query,
                                              String[] stringFields,
                                              String[] uuidFields,
                                              Map<String, Object> filters) {
        String[] merged = new String[stringFields.length + uuidFields.length];
        System.arraycopy(stringFields, 0, merged, 0, stringFields.length);
        System.arraycopy(uuidFields, 0, merged, stringFields.length, uuidFields.length);
        return build(query, merged, filters);
    }

    /** Resolves dotted field names like {@code "client.email"} into a nested {@link Path}. */
    private static Path<?> resolvePath(Root<?> root, String field) {
        int dot = field.indexOf('.');
        if (dot < 0) return root.get(field);
        Path<?> p = root.get(field.substring(0, dot));
        for (String segment : field.substring(dot + 1).split("\\.")) {
            p = p.get(segment);
        }
        return p;
    }
}
