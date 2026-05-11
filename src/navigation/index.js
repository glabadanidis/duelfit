import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, ActivityIndicator, View, TouchableOpacity } from 'react-native';

import HomeScreen from '../screens/Home';
import ChallengesScreen from '../screens/Challenges';
import LeaderboardScreen from '../screens/Leaderboard';
import ProfileScreen from '../screens/Profile';
import NotificationsScreen from '../screens/Notifications';
import OnboardingScreen from '../screens/Onboarding';
import LoginScreen from '../screens/Auth/Login';
import RegisterScreen from '../screens/Auth/Register';
import Step1Match from '../screens/NewChallenge/Step1Match';
import Step2Pick from '../screens/NewChallenge/Step2Pick';
import Step3Forfeit from '../screens/NewChallenge/Step3Forfeit';
import Step4Opponent from '../screens/NewChallenge/Step4Opponent';
import AcceptPickScreen from '../screens/NewChallenge/AcceptPick';
import MarkResultScreen from '../screens/NewChallenge/MarkResult';
import FriendsScreen from '../screens/Friends';
import SettingsScreen from '../screens/Settings';
import { ChallengeProvider } from '../constants/challengeContext';
import { supabase } from '../constants/supabase';
import colors from '../constants/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ name, focused }) {
  const icons = { Home: '🏠', Challenges: '⚔️', Leaderboard: '🏆', Profile: '👤' };
  return (
    <Text style={{ fontSize: focused ? 22 : 18, opacity: focused ? 1 : 0.5 }}>
      {icons[name]}
    </Text>
  );
}

function MainTabs({ navigation }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, height: 60, paddingBottom: 8 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} /> }} />
      <Tab.Screen name="Challenges" component={ChallengesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="Challenges" focused={focused} /> }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="Leaderboard" focused={focused} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon name="Profile" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

function RootStack({ session }) {
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
            <Stack.Screen name="MarkResult" component={MarkResultScreen} />
            <Stack.Screen name="Friends" component={FriendsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </ChallengeProvider>
  );
}

export default function Navigation() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
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
    <NavigationContainer>
      <RootStack session={session} />
    </NavigationContainer>
  );
}
