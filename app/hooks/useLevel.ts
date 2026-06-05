import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useLevel = () => {
  const [level, setLevel] = useState(1);
  const [currentXP, setCurrentXP] = useState(0);
  const [nextLevelXP, setNextLevelXP] = useState(100);

  useEffect(() => {
    loadLevel();
  }, []);

  const loadLevel = async () => {
    try {
      const lvl = parseInt(await AsyncStorage.getItem('user_level') || '1', 10);
      const xp = parseInt(await AsyncStorage.getItem('user_xp') || '0', 10);
      
      setLevel(lvl);
      setCurrentXP(xp);
      setNextLevelXP(lvl * 100);
      
      checkLevelUp(lvl, xp);
    } catch (error) {
      console.error('Failed to load level:', error);
    }
  };

  const addXP = async (amount: number) => {
    const newXP = currentXP + amount;
    
    if (newXP >= nextLevelXP) {
      // レベルアップ
      const newLevel = level + 1;
      const remainingXP = newXP - nextLevelXP;
      
      await AsyncStorage.setItem('user_level', newLevel.toString());
      await AsyncStorage.setItem('user_xp', remainingXP.toString());
      
      // レベルアップボーナス：50 Qコイン
      const currentCoins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
      await AsyncStorage.setItem('user_coins', (currentCoins + 50).toString());
      
      setLevel(newLevel);
      setCurrentXP(remainingXP);
      setNextLevelXP(newLevel * 100);
      
      return { leveledUp: true, newLevel };
    } else {
      await AsyncStorage.setItem('user_xp', newXP.toString());
      setCurrentXP(newXP);
      
      return { leveledUp: false };
    }
  };

  const addCoins = async (amount: number) => {
    const currentCoins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
    const newCoins = currentCoins + amount;
    await AsyncStorage.setItem('user_coins', newCoins.toString());
    return newCoins;
  };

  const checkLevelUp = async (lvl: number, xp: number) => {
    if (xp >= lvl * 100) {
      const newLevel = lvl + 1;
      const remainingXP = xp - (lvl * 100);
      
      await AsyncStorage.setItem('user_level', newLevel.toString());
      await AsyncStorage.setItem('user_xp', remainingXP.toString());
      
      setLevel(newLevel);
      setCurrentXP(remainingXP);
      setNextLevelXP(newLevel * 100);
    }
  };

  return { level, currentXP, nextLevelXP, addXP, addCoins, loadLevel };
};