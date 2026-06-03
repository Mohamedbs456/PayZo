package com.payzo.backend.dto.response.common;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Envelope for cursor-paginated lists (BACKEND_IMPACTS.md Impact 26 — backoffice
 * notifications). Cursor is an opaque string the client echoes back on the next
 * request to resume where the previous one left off.
 *
 * Differs from {@link PagedResponse} which is offset-based (page + size). Use
 * cursor pagination for "infinite scroll" feeds where new rows arrive at the head
 * and total count is uninteresting; offset pagination for stable tables where
 * totals + jump-to-page matter.
 */
@Data
@Builder
public class CursorPagedResponse<T> {

    private List<T> items;
    /** Pass back as {@code ?cursor=…} on the next request. Null when no more rows. */
    private String nextCursor;
    /** Convenience flag — equivalent to {@code nextCursor != null}. */
    private boolean hasMore;
}
