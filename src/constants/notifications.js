import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Duelfit',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF5722',
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: 'b735e07d-b072-45f8-815d-b4aa294a2852',
  })).data;
  return token;
}

export async function savePushToken() {
  try {
    const token = await registerForPushNotifications();
    if (!token) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', user.id);
  } catch (e) {
    // silently fail — push is non-critical
  }
}

export async function sendPushNotification(expoPushToken, title, body) {
  if (!expoPushToken) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: expoPushToken,
      title,
      body,
      sound: 'default',
      data: {},
    }),
  });
}

export async function notifyChallengeSent(opponentId, challengerUsername, matchName, challengeId) {
  const { data } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', opponentId)
    .single();

  if (!data?.push_token) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: data.push_token,
      title: '⚔️ New Challenge!',
      body: `@${challengerUsername} challenged you on ${matchName}`,
      sound: 'default',
      data: { challengeId },
    }),
  });
}

export async function notifyChallengeAccepted(challengerId, opponentUsername) {
  const { data } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', challengerId)
    .single();

  await sendPushNotification(
    data?.push_token,
    '✅ Challenge Accepted!',
    `@${opponentUsername} accepted your challenge — game on!`
  );
}

export async function notifyChallengeDeclined(challengerId, opponentUsername) {
  const { data } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', challengerId)
    .single();

  await sendPushNotification(
    data?.push_token,
    '❌ Challenge Declined',
    `@${opponentUsername} declined your challenge`
  );
}
