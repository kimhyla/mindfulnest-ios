// ResumePromptModal — LD-286 Layer 1 resume-choice UI.
//
// Shown before a module screen mounts when findInProgressSession() returns
// a non-stale SessionState. Chipper (canonical Guide Bird per LD-183) offers
// the child two tap targets: "Pick up where we were" or "Start fresh".
//
// Per the CRI framework and the preflight-91 counter H1 note: this is a
// DELIBERATE prompt, not auto-resume. RESUME_MODE in sessionState.ts can flip
// the behavior to silent-resume or silent-zero for future clinical review by
// Kim, but the shipping default is 'prompt'.
//
// No business logic lives here — callback props only. The route composes.

import type { ReactElement } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

import type { SessionState } from '../services/sessionState';

export interface ResumePromptModalProps {
  visible: boolean;
  sessionState: SessionState | null;
  onResume: () => void;
  onStartFresh: () => void;
}

export function ResumePromptModal(props: ResumePromptModalProps): ReactElement | null {
  const { visible, sessionState, onResume, onStartFresh } = props;
  if (!visible || sessionState == null) return null;

  const minutes = Math.floor(sessionState.audioPositionMs / 60_000);
  const seconds = Math.floor((sessionState.audioPositionMs % 60_000) / 1_000);
  const positionLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      accessibilityViewIsModal
      testID="resume_prompt_modal"
    >
      <View style={styles.backdrop} testID="resume_prompt_backdrop">
        <View style={styles.card} testID="resume_prompt_card">
          <Text style={styles.chipperBadge} testID="resume_prompt_chipper_badge">
            Chipper says:
          </Text>
          <Text style={styles.message} testID="resume_prompt_message">
            Should we pick up where we were, or start fresh?
          </Text>
          <Text style={styles.detail} testID="resume_prompt_detail">
            You were at {positionLabel}.
          </Text>
          <Pressable
            style={[styles.button, styles.primaryButton]}
            onPress={onResume}
            testID="resume_prompt_pick_up_button"
            accessibilityLabel="Pick up where we were"
          >
            <Text style={styles.primaryButtonText} testID="resume_prompt_pick_up_text">
              Pick up where we were
            </Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.secondaryButton]}
            onPress={onStartFresh}
            testID="resume_prompt_start_fresh_button"
            accessibilityLabel="Start fresh"
          >
            <Text style={styles.secondaryButtonText} testID="resume_prompt_start_fresh_text">
              Start fresh
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(30, 30, 50, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    maxWidth: 420,
    width: '100%',
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  chipperBadge: {
    fontSize: 13,
    color: '#4A6741',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  message: {
    fontSize: 20,
    color: '#1A1A2E',
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 26,
  },
  detail: {
    fontSize: 14,
    color: '#555',
    marginBottom: 20,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#4A6741',
  },
  secondaryButton: {
    backgroundColor: '#EEEEEE',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
});
