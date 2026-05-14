import { PropsWithChildren, ReactNode } from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/src/theme/colors';
import { spacing } from '@/src/theme/spacing';

type AppScreenProps = PropsWithChildren<{
  contentContainerStyle?: StyleProp<ViewStyle>;
  floatingAction?: ReactNode;
  scroll?: boolean;
}>;

export function AppScreen({
  children,
  contentContainerStyle,
  floatingAction,
  scroll = false,
}: AppScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.frame}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {floatingAction}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.frame, styles.content, contentContainerStyle]}>
        {children}
        {floatingAction}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.lg,
  },
  frame: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 430,
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 118,
    paddingTop: spacing.lg,
  },
});
