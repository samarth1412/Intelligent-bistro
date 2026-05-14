import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { MenuCategory, MenuItem } from '@intelligent-bistro/contracts';
import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppScreen } from '@/src/components/AppScreen';
import { useCartStore } from '@/src/features/cart/cartStore';
import { colors } from '@/src/theme/colors';
import { radii, spacing } from '@/src/theme/spacing';

import { useMenu } from './useMenu';

const categoryIcons: Record<MenuCategory, string> = {
  Burgers: '🍔',
  Desserts: '🍰',
  Drinks: '🥤',
  Sandwiches: '🥪',
  Sides: '🍟',
};

const formatPrice = (price: number) => `$${price.toFixed(2)}`;

export function MenuScreen() {
  const { categories, error, isLoading, items, refetch } = useMenu();
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>('Burgers');
  const [searchQuery, setSearchQuery] = useState('');
  const [addedItemId, setAddedItemId] = useState<string>();
  const addItem = useCartStore((state) => state.addItem);

  const popularItems = useMemo(
    () => items.filter((item) => item.tags.includes('popular')).slice(0, 4),
    [items]
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const scopedItems = normalizedQuery
      ? items
      : items.filter((item) => item.category === selectedCategory);

    if (!normalizedQuery) {
      return scopedItems;
    }

    return scopedItems.filter((item) =>
      [item.name, item.description, item.category, ...item.tags]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [items, searchQuery, selectedCategory]);

  function handleAddItem(item: MenuItem) {
    addItem(item);
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(undefined), 900);
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.greeting}>Good afternoon 👋</Text>
          <Text style={styles.title}>What would you like to order?</Text>
          <View style={styles.deliveryPill}>
            <FontAwesome color={colors.primary} name="map-marker" size={12} />
            <Text style={styles.deliveryText}>Fresh bistro menu</Text>
          </View>
        </View>
        <Pressable style={styles.iconButton}>
          <FontAwesome color={colors.ink} name="bell-o" size={20} />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <FontAwesome color={colors.muted} name="search" size={16} />
          <TextInput
            placeholder="Search for food or drinks..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <Pressable style={styles.filterButton}>
          <FontAwesome color={colors.ink} name="sliders" size={16} />
        </Pressable>
      </View>

      {error ? <MenuError message={error} onRetry={refetch} /> : null}

      <View style={styles.categoryRow}>
        {categories.map((category) => (
          <CategoryTile
            key={category}
            category={category}
            isSelected={category === selectedCategory && searchQuery.trim().length === 0}
            onPress={() => {
              setSelectedCategory(category);
              setSearchQuery('');
            }}
          />
        ))}
      </View>

      {isLoading ? (
        <MenuLoadingState />
      ) : (
        <>
          <SectionHeader title="Popular Picks" tone="hot" />
          <View style={styles.popularGrid}>
            {popularItems.slice(0, 2).map((item) => (
              <PopularMenuCard
                key={item.id}
                item={item}
                wasAdded={addedItemId === item.id}
                onAdd={() => handleAddItem(item)}
              />
            ))}
          </View>

          <SectionHeader
            title={searchQuery.trim() ? 'Search Results' : `All ${selectedCategory}`}
            count={visibleItems.length}
          />
          <View style={styles.listGroup}>
            {visibleItems.map((item) => (
              <MenuItemRow
                key={item.id}
                item={item}
                wasAdded={addedItemId === item.id}
                onAdd={() => handleAddItem(item)}
              />
            ))}
            {visibleItems.length === 0 ? <EmptyResults /> : null}
          </View>
        </>
      )}
    </AppScreen>
  );
}

function CategoryTile({
  category,
  isSelected,
  onPress,
}: {
  category: MenuCategory;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.categoryTile, isSelected && styles.categoryTileSelected]}>
      <View style={[styles.categoryIcon, isSelected && styles.categoryIconSelected]}>
        <Text style={styles.categoryEmoji}>{categoryIcons[category]}</Text>
      </View>
      <Text style={[styles.categoryLabel, isSelected && styles.categoryLabelSelected]}>
        {category}
      </Text>
    </Pressable>
  );
}

function PopularMenuCard({
  item,
  onAdd,
  wasAdded,
}: {
  item: MenuItem;
  onAdd: () => void;
  wasAdded: boolean;
}) {
  return (
    <View style={styles.popularCard}>
      <View style={styles.popularImageWrap}>
        <Image source={{ uri: item.imageUrl }} style={styles.popularImage} />
        {item.tags.includes('popular') ? <Text style={styles.popularBadge}>Popular</Text> : null}
      </View>
      <View style={styles.popularBody}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {item.name}
        </Text>
        <Text numberOfLines={2} style={styles.cardDescription}>
          {item.description}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.price}>{formatPrice(item.price)}</Text>
          <Pressable onPress={onAdd} style={styles.addPill}>
            <FontAwesome color={colors.onPrimary} name="plus" size={12} />
            <Text style={styles.addPillText}>{wasAdded ? 'Added' : 'Add'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MenuItemRow({
  item,
  onAdd,
  wasAdded,
}: {
  item: MenuItem;
  onAdd: () => void;
  wasAdded: boolean;
}) {
  return (
    <View style={styles.menuRow}>
      <Image source={{ uri: item.imageUrl }} style={styles.rowImage} />
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {item.name}
        </Text>
        <Text numberOfLines={2} style={styles.rowDescription}>
          {item.description}
        </Text>
        <View style={styles.tagRow}>
          {item.tags.slice(0, 2).map((tag) => (
            <Text key={tag} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
        <Text style={styles.rowPrice}>{formatPrice(item.price)}</Text>
      </View>
      <Pressable
        accessibilityLabel={`Add ${item.name} to cart`}
        onPress={onAdd}
        style={[styles.rowAddButton, wasAdded && styles.rowAddButtonAdded]}>
        <FontAwesome color={colors.onPrimary} name={wasAdded ? 'check' : 'plus'} size={14} />
      </Pressable>
    </View>
  );
}

function SectionHeader({
  count,
  title,
  tone,
}: {
  count?: number;
  title: string;
  tone?: 'hot';
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {tone === 'hot' ? <Text style={styles.trendingPill}>Trending</Text> : null}
      </View>
      {count !== undefined ? <Text style={styles.sectionCount}>{count} items</Text> : null}
    </View>
  );
}

function MenuLoadingState() {
  return (
    <View style={styles.loadingGroup}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.loadingRow}>
          <View style={styles.loadingImage} />
          <View style={styles.loadingTextGroup}>
            <View style={styles.loadingLineLarge} />
            <View style={styles.loadingLineSmall} />
          </View>
        </View>
      ))}
    </View>
  );
}

function MenuError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorCard}>
      <View style={styles.errorIcon}>
        <FontAwesome color={colors.danger} name="exclamation" size={14} />
      </View>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function EmptyResults() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No items found</Text>
      <Text style={styles.emptyBody}>Try another category or search term.</Text>
    </View>
  );
}

const sharedShadow = {
  elevation: 5,
  shadowColor: colors.cardShadow,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.07,
  shadowRadius: 20,
};

const styles = StyleSheet.create({
  addPill: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.full,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  addPillText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 36,
  },
  cardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  categoryEmoji: {
    fontSize: 25,
    lineHeight: 29,
  },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  categoryIconSelected: {
    backgroundColor: '#FFE7CA',
  },
  categoryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  categoryLabelSelected: {
    color: colors.ink,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoryTile: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'transparent',
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    height: 92,
    justifyContent: 'center',
    minWidth: 0,
  },
  categoryTileSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FFF9F2',
    shadowOpacity: 0.1,
  },
  deliveryPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  deliveryText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: '#FFF0EB',
    borderColor: '#F1C7BA',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  errorIcon: {
    alignItems: 'center',
    backgroundColor: '#FFE0D8',
    borderRadius: radii.full,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  filterButton: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  greeting: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerCopy: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  listGroup: {
    gap: spacing.md,
  },
  loadingGroup: {
    gap: spacing.md,
  },
  loadingImage: {
    backgroundColor: colors.softAccent,
    borderRadius: radii.md,
    height: 72,
    width: 72,
  },
  loadingLineLarge: {
    backgroundColor: colors.softAccent,
    borderRadius: radii.full,
    height: 16,
    width: '72%',
  },
  loadingLineSmall: {
    backgroundColor: '#F3E5D4',
    borderRadius: radii.full,
    height: 12,
    width: '52%',
  },
  loadingRow: {
    ...sharedShadow,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  loadingTextGroup: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  menuRow: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 112,
    padding: spacing.md,
  },
  popularBadge: {
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
    left: 10,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    position: 'absolute',
    top: 10,
  },
  popularBody: {
    gap: spacing.sm,
    padding: 14,
  },
  popularCard: {
    ...sharedShadow,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  popularGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  popularImage: {
    height: '100%',
    width: '100%',
  },
  popularImageWrap: {
    backgroundColor: colors.softAccent,
    height: 146,
    overflow: 'hidden',
  },
  price: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  retryButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  rowAddButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.ink,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowAddButtonAdded: {
    backgroundColor: colors.success,
  },
  rowBody: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  rowDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  rowImage: {
    backgroundColor: colors.softAccent,
    borderRadius: radii.md,
    height: 82,
    width: 82,
  },
  rowPrice: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  searchBox: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 26,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    minWidth: 0,
  },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '900',
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.softAccent,
    borderRadius: radii.full,
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: 'capitalize',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  title: {
    color: colors.ink,
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 34,
    maxWidth: 270,
  },
  trendingPill: {
    backgroundColor: colors.softAccent,
    borderRadius: radii.full,
    color: colors.accentDark,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
});
