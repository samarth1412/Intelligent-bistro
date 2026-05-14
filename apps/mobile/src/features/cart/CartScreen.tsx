import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/src/components/AppScreen';
import { colors } from '@/src/theme/colors';
import { radii, spacing } from '@/src/theme/spacing';

import {
  calculateCartTotals,
  type CartLineItem,
  selectCartLines,
  useCartStore,
} from './cartStore';

const formatPrice = (price: number) => `$${price.toFixed(2)}`;

export function CartScreen() {
  const lines = useCartStore(selectCartLines);
  const totals = useMemo(() => calculateCartTotals(lines), [lines]);
  const clearCart = useCartStore((state) => state.clearCart);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);

  function decrement(line: CartLineItem) {
    if (line.quantity <= 1) {
      removeItem(line.itemId, undefined, line.modifiers);
      return;
    }

    updateQuantity(line.itemId, line.quantity - 1, line.modifiers);
  }

  function increment(line: CartLineItem) {
    updateQuantity(line.itemId, line.quantity + 1, line.modifiers);
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Order summary</Text>
          <Text style={styles.title}>Your Cart</Text>
        </View>
        <Pressable
          accessibilityLabel="Clear cart"
          disabled={lines.length === 0}
          onPress={clearCart}
          style={[styles.clearButton, lines.length === 0 && styles.clearButtonDisabled]}>
          <FontAwesome color={lines.length === 0 ? colors.muted : colors.ink} name="trash-o" size={22} />
        </Pressable>
      </View>

      {lines.length > 0 ? (
        <>
          <View style={styles.savingsBanner}>
            <FontAwesome color={colors.success} name="leaf" size={15} />
            <Text style={styles.savingsText}>Fresh picks are ready for checkout</Text>
          </View>

          <View style={styles.cartList}>
            {lines.map((line) => (
              <CartLineCard
                key={line.lineId}
                line={line}
                onDecrement={() => decrement(line)}
                onIncrement={() => increment(line)}
                onRemove={() => removeItem(line.itemId, undefined, line.modifiers)}
              />
            ))}
          </View>

          <View style={styles.summaryCard}>
            <SummaryRow label="Subtotal" value={formatPrice(totals.subtotal)} />
            <SummaryRow label="Tax (8.75%)" value={formatPrice(totals.tax)} />
            <View style={styles.summaryDivider} />
            <SummaryRow isTotal label="Total" value={formatPrice(totals.total)} />
          </View>

          <Link href="/payment" asChild>
            <Pressable accessibilityRole="button" style={styles.checkoutButton}>
              <Text style={styles.checkoutText}>Proceed to Checkout</Text>
              <FontAwesome color={colors.onPrimary} name="long-arrow-right" size={16} />
            </Pressable>
          </Link>
        </>
      ) : (
        <EmptyCart />
      )}
    </AppScreen>
  );
}

function CartLineCard({
  line,
  onDecrement,
  onIncrement,
  onRemove,
}: {
  line: CartLineItem;
  onDecrement: () => void;
  onIncrement: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.lineCard}>
      <Image source={{ uri: line.imageUrl }} style={styles.lineImage} />
      <View style={styles.lineBody}>
        <View style={styles.lineTopRow}>
          <View style={styles.lineTitleGroup}>
            <Text numberOfLines={1} style={styles.lineTitle}>
              {line.name}
            </Text>
            <Text numberOfLines={1} style={styles.modifierText}>
              {line.modifiers.length > 0 ? titleCase(line.modifiers.join(', ')) : 'Regular'}
            </Text>
          </View>
          <Pressable accessibilityLabel={`Remove ${line.name}`} onPress={onRemove} style={styles.removeButton}>
            <FontAwesome color={colors.muted} name="trash-o" size={17} />
          </Pressable>
        </View>

        <View style={styles.lineBottomRow}>
          <Text style={styles.linePrice}>{formatPrice(line.unitPrice)}</Text>
          <View style={styles.quantityStepper}>
            <Pressable accessibilityLabel={`Decrease ${line.name}`} onPress={onDecrement} style={styles.stepperButton}>
              <FontAwesome color={colors.ink} name="minus" size={11} />
            </Pressable>
            <Text style={styles.quantityText}>{line.quantity}</Text>
            <Pressable accessibilityLabel={`Increase ${line.name}`} onPress={onIncrement} style={styles.stepperButton}>
              <FontAwesome color={colors.ink} name="plus" size={11} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
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
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, isTotal && styles.totalLabel]}>{label}</Text>
      <Text style={[styles.summaryValue, isTotal && styles.totalValue]}>{value}</Text>
    </View>
  );
}

function EmptyCart() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <FontAwesome color={colors.primary} name="shopping-basket" size={28} />
      </View>
      <Text style={styles.emptyTitle}>Your cart is empty</Text>
      <Text style={styles.emptyBody}>Add favorites from the menu or ask the assistant to build an order.</Text>
      <View style={styles.emptyActions}>
        <Link href="/" asChild>
          <Pressable style={styles.menuButton}>
            <FontAwesome color={colors.onPrimary} name="cutlery" size={14} />
            <Text style={styles.menuButtonText}>Browse Menu</Text>
          </Pressable>
        </Link>
        <Link href="/assistant" asChild>
          <Pressable style={styles.aiButton}>
            <FontAwesome color={colors.ink} name="magic" size={14} />
            <Text style={styles.aiButtonText}>Ask AI</Text>
          </Pressable>
        </Link>
      </View>
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
  aiButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  aiButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  cartList: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  checkoutButton: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 22,
    flexDirection: 'row',
    gap: spacing.md,
    height: 56,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  checkoutText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  clearButtonDisabled: {
    opacity: 0.45,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 280,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.softAccent,
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  emptyWrap: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 330,
    padding: spacing.xl,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  lineBody: {
    flex: 1,
    gap: spacing.lg,
    minWidth: 0,
  },
  lineBottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lineCard: {
    ...sharedShadow,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 126,
    padding: spacing.md,
  },
  lineImage: {
    backgroundColor: colors.softAccent,
    borderRadius: radii.md,
    height: 82,
    width: 82,
  },
  linePrice: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  lineTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  lineTitleGroup: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  lineTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  menuButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  menuButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '900',
  },
  modifierText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  quantityStepper: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    height: 40,
    justifyContent: 'space-between',
    minWidth: 112,
    paddingHorizontal: 6,
  },
  quantityText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
    minWidth: 28,
    textAlign: 'center',
  },
  removeButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  savingsBanner: {
    alignItems: 'center',
    backgroundColor: colors.softSuccess,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  savingsText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '800',
  },
  stepperButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
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
  summaryDivider: {
    backgroundColor: colors.border,
    height: 1,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  totalLabel: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  totalValue: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
});
