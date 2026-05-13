import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AppScreen } from '@/src/components/AppScreen';
import { colors } from '@/src/theme/colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <AppScreen contentContainerStyle={styles.container}>
        <Link href="/" style={styles.link}>
          Back to menu
        </Link>
      </AppScreen>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
