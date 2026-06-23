import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CalculatorScreen } from './src/screens/CalculatorScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.tabBarActive,
          tabBarInactiveTintColor: colors.tabBarInactive,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.tabBarBorder,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          headerShown: false,
        }}
      >
        <Tab.Screen name="Calculator" component={CalculatorScreen} options={{ tabBarLabel: 'Calculator' }} />
        <Tab.Screen name="Help" component={HelpScreen} options={{ tabBarLabel: 'Guide' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
