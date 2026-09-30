import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, ActivityIndicator, View, TouchableOpacity, AppState, Image } from 'react-native';

import HomeScreen from '../screens/Home';
import ChallengesScreen from '../screens/Challenges';
import LeaderboardScreen from '../screens/Leaderboard';
import ProfileScreen from '../screens/Profile';
import NotificationsScreen from '../screens/Notifications';
import OnboardingScreen from '../screens/Onboarding';
import LoginScreen from '../screens/Auth/Login';
import RegisterScreen from '../screens/Auth/Register';
import ForgotPasswordScreen from '../screens/Auth/ForgotPassword';
import ConfirmEmailScreen from '../screens/Auth/ConfirmEmail';
import Step1Match from '../screens/NewChallenge/Step1Match';
import Step2Pick from '../screens/NewChallenge/Step2Pick';
import Step3Forfeit from '../screens/NewChallenge/Step3Forfeit';
import Step4Opponent from '../screens/NewChallenge/Step4Opponent';
import AcceptPickScreen from '../screens/NewChallenge/AcceptPick';
import FriendsScreen from '../screens/Friends';
import SettingsScreen from '../screens/Settings';
import ChallengeDetailScreen from '../screens/Challenges/Detail';
import { ChallengeProvider } from '../constants/challengeContext';
import { supabase } from '../constants/supabase';
import colors from '../constants/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Home is the DuelFit mark rather than an emoji. It is a little larger than the
// emoji because its two runners are thinner than a glyph at the same size.
function TabIcon({ name, focused }) {
  if (name === 'Home') {
    const size = focused ? 28 : 24;
    return <Image source={require('../../assets/logo-mark.png')} style={{ width: size, height: size, opacity: focused ? 1 : 0.5 }} />;
  }
  const icons = { Challenges: '⚔️', Leaderboard: '🏆', FriendsTab: '👥', Profile: '👤' };
  return (
    <Text style={{ fontSize: focused ? 22 : 18, opacity: focused ? 1 : 0.5 }}>
      {icons[name]}
    </Text>
  );
}

// The numbers on the Challenges and Friends tabs: active duels (pending or
// accepted, the same as Home) and incoming friend requests.
//
// Recounted on every tab focus, when the app comes back to the foreground, and on
// any realtime change. Supabase cannot filter DELETE events, and cancelling a
// challenge or declining a request is a delete, so deletes are heard unfiltered
// and only trigger a recount. Channel naming and the cancelled flag follow Home.
function useTabBadges() {
  const [counts, setCounts] = useState({ challenges: 0, requests: 0 });

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ count: challenges }, { count: requests }] = await Promise.all([
      supabase
        .from('challenges')
        .select('id', { count: 'exact', head: true })
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .in('status', ['pending', 'accepted']),
      supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', user.id)
        .eq('status', 'pending'),
    ]);
    setCounts({ challenges: challenges || 0, requests: requests || 0 });
  }, []);

  useEffect(() => {
    let sub;
    let cancelled = false;
    refresh();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      sub = supabase
        .channel(`tab-badges:${user.id}:${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `challenger_id=eq.${user.id}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges', filter: `opponent_id=eq.${user.id}` }, refresh)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'challenges' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${user.id}` }, refresh)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'friendships' }, refresh)
        .subscribe();
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      cancelled = true;
      if (sub) supabase.removeChannel(sub);
      appState.remove();
    };
  }, [refresh]);

  return { ...counts, refresh };
}

// undefined hides the badge entirely
function badge(n) {
  if (!n) return undefined;
  return n > 99 ? '99+' : n;
}

function MainTabs({ navigation }) {
  const badges = useTabBadges();
  return (
    <Tab.Navigator
      screenListeners={{ focus: badges.refresh }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: 60, paddingBottom: 8 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.white, fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} /> }} />
      <Tab.Screen name="Challenges" component={ChallengesScreen}
        options={{ tabBarBadge: badge(badges.challenges), tabBarIcon: ({ focused }) => <TabIcon name="Challenges" focused={focused} /> }} />
      {/* FriendsTab, not Friends: the stack keeps its own Friends screen so that
          Step4Opponent can open it on top of the wizard and come back with the
          draft intact. Switching to a tab would pop the wizard off. */}
      <Tab.Screen name="FriendsTab" component={FriendsScreen}
        options={{ tabBarLabel: 'Friends', tabBarBadge: badge(badges.requests), tabBarIcon: ({ focused }) => <TabIcon name="FriendsTab" focused={focused} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="Profile" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

function RootStack({ session, onboardingDone, setOnboardingDone }) {
  async function markOnboardingDone() {
    await AsyncStorage.setItem('onboarding_done', 'true');
    setOnboardingDone(true);
  }

  return (
    <ChallengeProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Step1Match" component={Step1Match} />
            <Stack.Screen name="Step2Pick" component={Step2Pick} />
            <Stack.Screen name="Step3Forfeit" component={Step3Forfeit} />
            <Stack.Screen name="Step4Opponent" component={Step4Opponent} />
            <Stack.Screen name="AcceptPick" component={AcceptPickScreen} />
            <Stack.Screen name="Friends" component={FriendsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="ChallengeDetail" component={ChallengeDetailScreen} />
            {/* Hidden, not removed: the Leaderboard tab is off while points are not
                shown. Nothing links here. Put the Tab.Screen back to bring it back. */}
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
          </>
        ) : (
          <>
            {!onboardingDone && (
              <Stack.Screen name="Onboarding">
                {props => <OnboardingScreen {...props} onDone={markOnboardingDone} />}
              </Stack.Screen>
            )}
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ConfirmEmail" component={ConfirmEmailScreen} />
          </>
        )}
      </Stack.Navigator>
    </ChallengeProvider>
  );
}

export default function Navigation({ navigationRef }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    async function init() {
      const seen = await AsyncStorage.getItem('onboarding_done');
      if (seen) setOnboardingDone(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    }
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack session={session} onboardingDone={onboardingDone} setOnboardingDone={setOnboardingDone} />
    </NavigationContainer>
  );
}
