import { StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/src/components/AppScreen';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { colors } from '@/src/theme/colors';
import { radii, spacing } from '@/src/theme/spacing';

const categories = ['Burgers', 'Sandwiches', 'Drinks', 'Sides', 'Desserts'];

export function MenuScreen() {
  return (
    <AppScreen scroll>
      <ScreenHeader
        eyebrow="Intelligent Bistro"
        title="Menu"
        subtitle="Seasonal favorites, crisp sides, and house drinks prepared for quick ordering."
      />

      <View style={styles.categoryRow}>
        {categories.map((category) => (
          <View key={category} style={styles.categoryPill}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>
        ))}
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.cardEyebrow}>Chef pick</Text>
        <Text style={styles.cardTitle}>Smoked Bistro Burger</Text>
        <Text style={styles.cardBody}>
          Charred beef, aged cheddar, tomato jam, and crisp shallots on a brioche bun.
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  cardEyebrow: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
  categoryPill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  categoryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
});
