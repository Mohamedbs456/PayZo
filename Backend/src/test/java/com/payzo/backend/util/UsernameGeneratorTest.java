package com.payzo.backend.util;

import com.payzo.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UsernameGeneratorTest {

    @Mock private UserRepository userRepository;

    @InjectMocks
    private UsernameGenerator generator;

    @Test
    void generateFor_returnsBaseHandle_whenNoCollision() {
        when(userRepository.existsByUsername("mohamed.bensalem")).thenReturn(false);

        String username = generator.generateFor("Mohamed", "Ben Salem");

        assertThat(username).isEqualTo("mohamed.bensalem");
    }

    @Test
    void generateFor_appendsNumericSuffix_whenBaseTaken() {
        when(userRepository.existsByUsername("mohamed.bensalem")).thenReturn(true);
        when(userRepository.existsByUsername("mohamed.bensalem2")).thenReturn(true);
        when(userRepository.existsByUsername("mohamed.bensalem3")).thenReturn(false);

        String username = generator.generateFor("Mohamed", "Ben Salem");

        assertThat(username).isEqualTo("mohamed.bensalem3");
    }

    @Test
    void generateFor_stripsAccentsAndDiacritics_forFrenchTunisianNames() {
        when(userRepository.existsByUsername("beatrice.boualeg")).thenReturn(false);

        String username = generator.generateFor("Béatrice", "Boualég");

        assertThat(username).isEqualTo("beatrice.boualeg");
    }

    @Test
    void generateFor_lowercasesEverything() {
        when(userRepository.existsByUsername("ahmed.tlili")).thenReturn(false);

        String username = generator.generateFor("AHMED", "TLILI");

        assertThat(username).isEqualTo("ahmed.tlili");
    }

    @Test
    void generateFor_fallsBackToUser_whenBothNamesAreEmpty() {
        when(userRepository.existsByUsername("user")).thenReturn(false);

        String username = generator.generateFor("", "");

        assertThat(username).isEqualTo("user");
    }

    @Test
    void generateFor_handlesNullInputsGracefully() {
        when(userRepository.existsByUsername("user")).thenReturn(false);

        String username = generator.generateFor(null, null);

        assertThat(username).isEqualTo("user");
    }

    @Test
    void generateFor_stripsSpacesAndPunctuation() {
        when(userRepository.existsByUsername("mariejose.benyoussef")).thenReturn(false);

        String username = generator.generateFor("Marie-José", "Ben Youssef");

        assertThat(username).isEqualTo("mariejose.benyoussef");
    }
}
