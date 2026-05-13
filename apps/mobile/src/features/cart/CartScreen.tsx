import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/src/components/AppScreen';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { colors } from '@/src/theme/colors';
import { radii, spacing } from '@/src/theme/spacing';

export function CartScreen() {
  return (
    <AppScreen>
      <ScreenHeader eyebrow="Order" title="Cart" subtitle="Your current bistro order." />

      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptyBody}>Add a favorite from the menu to start an order.</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  emptyBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
