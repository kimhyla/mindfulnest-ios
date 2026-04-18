import type { ReactElement } from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';

export default function AuthGroupLayout(): ReactElement {
  const { status } = useAuth();
  // Only redirect once auth state is known — avoid flashing sign-in for
  // signed-in users during cold start.
  if (status === 'signedIn') {
    return <Redirect href="/" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
