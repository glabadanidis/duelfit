import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Navigation from './src/navigation';
import { savePushToken } from './src/constants/notifications';
import { supabase } from './src/constants/supabase';

export default function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') savePushToken();
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      if (!navigationRef.current) return;

      // A challenge notification — navigate to Challenges tab so they can accept
      if (data?.challengeId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { data: challenge } = await supabase
            .from('challenges')
            .select(`*, challenger:profiles!challenges_challenger_id_fkey(username), opponent:profiles!challenges_opponent_id_fkey(username)`)
            .eq('id', data.challengeId)
            .single();
          if (challenge && challenge.status === 'pending' && challenge.opponent_id === user.id) {
            navigationRef.current.navigate('AcceptPick', { challenge });
            return;
          }
        } catch {}
      }
      // Fallback: open Challenges tab
      navigationRef.current.navigate('Main', { screen: 'Challenges' });
    });
    return () => sub.remove();
  }, []);

  return <Navigation navigationRef={navigationRef} />;
}
