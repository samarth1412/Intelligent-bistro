import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/src/components/AppScreen';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { colors } from '@/src/theme/colors';
import { radii, spacing } from '@/src/theme/spacing';

export function AssistantScreen() {
  return (
    <AppScreen contentContainerStyle={styles.container}>
      <ScreenHeader eyebrow="AI" title="Assistant" subtitle="What can I get started for you?" />

      <View style={styles.chatPanel}>
        <View style={styles.assistantBubble}>
          <Text style={styles.assistantText}>Try: add two bistro burgers and a large water.</Text>
        </View>
      </View>

      <View style={styles.composer}>
        <TextInput
          editable={false}
          placeholder="Ask for an order update"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Pressable disabled style={styles.sendButton}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: '84%',
    padding: spacing.md,
  },
  assistantText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  chatPanel: {
    flex: 1,
  },
  composer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  container: {
    gap: spacing.md,
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
