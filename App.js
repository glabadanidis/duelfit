import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import Navigation from './src/navigation';
import { savePushToken } from './src/constants/notifications';
import { supabase } from './src/constants/supabase';

export default function App() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') savePushToken();
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {});
    return () => sub.remove();
  }, []);

  return <Navigation />;
}
