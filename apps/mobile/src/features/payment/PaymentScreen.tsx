import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/src/components/AppScreen';
import {
  calculateCartTotals,
  selectCartLines,
  useCartStore,
} from '@/src/features/cart/cartStore';
import { colors } from '@/src/theme/colors';
import { radii, spacing } from '@/src/theme/spacing';

const formatPrice = (price: number) => `$${price.toFixed(2)}`;

export function PaymentScreen() {
  const router = useRouter();
  const lines = useCartStore(selectCartLines);
  const totals = useMemo(() => calculateCartTotals(lines), [lines]);

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome color={colors.ink} name="angle-left" size={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Checkout</Text>
          <Text style={styles.title}>Payment</Text>
        </View>
      </View>

      {lines.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <FontAwesome color={colors.primary} name="shopping-basket" size={24} />
          </View>
          <Text style={styles.emptyTitle}>No items to pay for</Text>
          <Text style={styles.emptyBody}>Add something from the menu before moving to payment.</Text>
          <Link href="/" asChild>
            <Pressable style={styles.primaryButton}>
              <FontAwesome color={colors.onPrimary} name="cutlery" size={14} />
              <Text style={styles.primaryButtonText}>Browse Menu</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.sectionTitle}>Order</Text>
              <Text style={styles.itemCount}>{totals.itemCount} items</Text>
            </View>
            {lines.map((line) => (
              <View key={line.lineId} style={styles.lineRow}>
                <Image source={{ uri: line.imageUrl }} style={styles.lineImage} />
                <View style={styles.lineBody}>
                  <Text numberOfLines={1} style={styles.lineName}>
                    {line.quantity}x {line.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.lineMeta}>
                    {line.modifiers.length > 0 ? titleCase(line.modifiers.join(', ')) : 'Regular'}
                  </Text>
                </View>
                <Text style={styles.linePrice}>{formatPrice(line.unitPrice * line.quantity)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.paymentCard}>
            <Text style={styles.sectionTitle}>Payment method</Text>
            <View style={styles.paymentOptionSelected}>
              <View style={styles.paymentIcon}>
                <FontAwesome color={colors.onPrimary} name="credit-card" size={15} />
              </View>
              <View style={styles.paymentCopy}>
                <Text style={styles.paymentTitle}>Demo card</Text>
                <Text style={styles.paymentSubtitle}>Checkout UI only</Text>
              </View>
              <FontAwesome color={colors.success} name="check-circle" size={18} />
            </View>
          </View>

          <View style={styles.totalsCard}>
            <SummaryRow label="Subtotal" value={formatPrice(totals.subtotal)} />
            <SummaryRow label="Tax" value={formatPrice(totals.tax)} />
            <View style={styles.divider} />
            <SummaryRow isTotal label="Total" value={formatPrice(totals.total)} />
          </View>

          <Pressable accessibilityRole="button" style={styles.payButton}>
            <FontAwesome color={colors.onPrimary} name="lock" size={14} />
            <Text style={styles.payButtonText}>Pay {formatPrice(totals.total)}</Text>
          </Pressable>
        </>
      )}
    </AppScreen>
  );
}

function SummaryRow({
  isTotal = false,
  label,
  value,
}: {
  isTotal?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, isTotal && styles.totalLabelStrong]}>{label}</Text>
      <Text style={[styles.totalValue, isTotal && styles.totalValueStrong]}>{value}</Text>
    </View>
  );
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const sharedShadow = {
  elevation: 5,
  shadowColor: colors.cardShadow,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.07,
  shadowRadius: 20,
};

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 250,
    textAlign: 'center',
  },
  emptyCard: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    minHeight: 330,
    padding: spacing.xl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.softAccent,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '900',
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  itemCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  lineBody: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  lineImage: {
    backgroundColor: colors.softAccent,
    borderRadius: radii.sm,
    height: 48,
    width: 48,
  },
  lineMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  lineName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  linePrice: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  lineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  payButton: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 22,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 56,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  payButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  paymentCard: {
    ...sharedShadow,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  paymentCopy: {
    flex: 1,
    gap: 3,
  },
  paymentIcon: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  paymentOptionSelected: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 66,
    padding: spacing.md,
  },
  paymentSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  paymentTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  summaryCard: {
    ...sharedShadow,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.ink,
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 35,
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  totalLabelStrong: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalsCard: {
    ...sharedShadow,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  totalValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  totalValueStrong: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
});
