import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { selectCartItemCount, useCartStore } from '@/src/features/cart/cartStore';
import { colors } from '@/src/theme/colors';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} {...props} />;
}

export default function TabLayout() {
  const cartItemCount = useCartStore(selectCartItemCount);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '800',
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 70,
          paddingBottom: 10,
          paddingTop: 8,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color }) => <TabBarIcon name="cutlery" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'AI',
          tabBarIcon: () => (
            <View style={styles.aiTabIcon}>
              <FontAwesome color={colors.onPrimary} name="magic" size={22} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarBadge: cartItemCount > 0 ? cartItemCount : undefined,
          tabBarBadgeStyle: styles.cartBadge,
          tabBarIcon: ({ color }) => <TabBarIcon name="shopping-basket" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  aiTabIcon: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderColor: colors.surface,
    borderRadius: 28,
    borderWidth: 4,
    elevation: 8,
    height: 56,
    justifyContent: 'center',
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: 56,
  },
  cartBadge: {
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    fontSize: 11,
    fontWeight: '900',
  },
});
