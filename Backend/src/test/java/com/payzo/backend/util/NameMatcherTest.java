package com.payzo.backend.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class NameMatcherTest {

    @Test
    void matches_exactSameStrings() {
        assertThat(NameMatcher.matches("Hamza", "Hamza")).isTrue();
    }

    @Test
    void matches_caseInsensitive() {
        assertThat(NameMatcher.matches("hamza", "HAMZA")).isTrue();
        assertThat(NameMatcher.matches("Ben Salem", "BEN SALEM")).isTrue();
    }

    @Test
    void matches_accentInsensitive() {
        assertThat(NameMatcher.matches("Société", "Societe")).isTrue();
        assertThat(NameMatcher.matches("Aïcha", "Aicha")).isTrue();
        assertThat(NameMatcher.matches("Émirats", "Emirats")).isTrue();
    }

    @Test
    void matches_collapsesWhitespace() {
        assertThat(NameMatcher.matches("Ben  Salem", "Ben Salem")).isTrue();
        assertThat(NameMatcher.matches("  Hamza  ", "Hamza")).isTrue();
    }

    @Test
    void matches_rejectsDifferentNames() {
        assertThat(NameMatcher.matches("Hamza", "Karim")).isFalse();
        assertThat(NameMatcher.matches("Ben Salem", "Trabelsi")).isFalse();
    }

    @Test
    void matches_handlesNulls() {
        assertThat(NameMatcher.matches(null, null)).isTrue();
        assertThat(NameMatcher.matches(null, "Hamza")).isFalse();
        assertThat(NameMatcher.matches("Hamza", null)).isFalse();
    }
}
