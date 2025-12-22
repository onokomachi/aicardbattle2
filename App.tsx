
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, increment, arrayUnion, query, where, limit, getDocs, onSnapshot, runTransaction, writeBatch } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import TopScreen from './components/TopScreen';
import DeckBuilder from './components/DeckBuilder';
import Matchmaking from './components/Matchmaking';
import GameBoard from './components/GameBoard';
import RankingBoard from './components/RankingBoard';
import GameMaster from './components/GameMaster';
import Shop from './components/Shop';
import type { CardData, GameState, TurnPhase, BattleOutcome, AttributeCounts, Room, Attribute } from './types';
import { INITIAL_HP, HAND_SIZE, DECK_SIZE, INITIAL_UNLOCKED_CARDS, CardCatalogById as StaticCardCatalogById, CARD_DEFINITIONS, ADMIN_EMAILS, GAMEMASTER_PASSWORD } from './constants';
import LevelUpAnimation from './components/LevelUpAnimation';
import { useCardData } from './useCardData';

const firebaseConfig = {
  apiKey: (import.meta as any)?.env?.VITE_API_KEY || "AIzaSyBRExH6ECNWLfqBr8pANV4lst3tBl2fvO0",
  authDomain: "aicardbattle2.firebaseapp.com",
  projectId: "aicardbattle2",
  storageBucket: "aicardbattle2.firebasestorage.app",
  messagingSenderId: "435382299626",
  appId: "1:435382299626:web:119dfe40779010642d2093",
  measurementId: "G-1XYS1W9WHL"
};

let app, auth: any, db: any, storage: any, googleProvider: any, analytics: any;
try {
  app = initializeApp(firebaseConfig);
  analytics = getAnalytics(app);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  googleProvider = new GoogleAuthProvider();
} catch (error) {
  console.warn("Firebase initialization skipped.", error);
}

const shuffleDeck = (deck: CardData[]): CardData[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

const getAttributeMatchup = (attacker: Attribute, defender: Attribute): 'advantage' | 'disadvantage' | 'neutral' => {
  if (attacker === defender) return 'neutral';
  if ((attacker === 'passion' && defender === 'harmony') || (attacker === 'harmony' && defender === 'calm') || (attacker === 'calm' && defender === 'passion')) return 'advantage';
  return 'disadvantage';
};

const HIDDEN_CARD: CardData = { id: -1, definitionId: -1, baseDefinitionId: -1, name: "？？？", attack: 0, defense: 0, image: "11.jpg", description: "相手がカードを選択しました", effect: 'NONE', attribute: 'passion' };

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [coins, setCoins] = useState(0);
  const [gameState, setGameState] = useState<GameState>('login_screen');
  const [gameMode, setGameMode] = useState<'cpu' | 'pvp'>('cpu');
  const [unlockedCardIds, setUnlockedCardIds] = useState<number[]>([]);
  const [savedDecks, setSavedDecks] = useState<Record<string, number[]>>({});

  // Evidence Level 5: Centralized Fetching via Hook
  const { allCards, cardCatalog, isLoading: isLoadingCards } = useCardData(db);

  // Game State
  const [playerDeck, setPlayerDeck] = useState<CardData[]>([]);
  const [pcDeck, setPcDeck] = useState<CardData[]>([]);
  const [playerHand, setPlayerHand] = useState<CardData[]>([]);
  const [pcHand, setPcHand] = useState<CardData[]>([]);
  const [playerHP, setPlayerHP] = useState(INITIAL_HP);
  const [pcHP, setPcHP] = useState(INITIAL_HP);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('player_turn');
  const [pcAttributeCount, setPcAttributeCount] = useState<AttributeCounts>({ passion: 0, calm: 0, harmony: 0 });
  const [gameLog, setGameLog] = useState<string[]>([]);
  const [playerPlayedCard, setPlayerPlayedCard] = useState<CardData | null>(null);
  const [pcPlayedCard, setPcPlayedCard] = useState<CardData | null>(null);
  const [battleOutcome, setBattleOutcome] = useState<{ player: BattleOutcome; pc: BattleOutcome } | null>(null);
  const [playerIsCasting, setPlayerIsCasting] = useState(false);
  const [pcIsCasting, setPcIsCasting] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

  const [levelUpMap, setLevelUpMap] = useState<Record<number, number>>({});
  const [levelUpAnimationData, setLevelUpAnimationData] = useState<{ from: CardData; to: CardData; } | null>(null);
  const nextCardInstanceId = useRef(0);
  const postAnimationCallback = useRef<(() => void) | null>(null);

  const [showRanking, setShowRanking] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [matchStatus, setMatchStatus] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [rooms, setRooms] = useState<Room[]>([]);
  const unsubscribeRoomRef = useRef<(() => void) | null>(null);

  // Refs for State Safety
  const isHostRef = useRef(isHost);
  const turnPhaseRef = useRef(turnPhase);
  const gameStateRef = useRef(gameState);
  const currentRoundRef = useRef(currentRound);
  const pcPlayedCardRef = useRef(pcPlayedCard); 
  const userRef = useRef(user);
  const processedMatchIdRef = useRef<string | null>(null);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { turnPhaseRef.current = turnPhase; }, [turnPhase]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);
  useEffect(() => { pcPlayedCardRef.current = pcPlayedCard; }, [pcPlayedCard]);
  useEffect(() => { userRef.current = user; }, [user]);

  const addLog = useCallback((message: string) => {
    setGameLog(prev => [...prev, message]);
  }, []);

  useEffect(() => {
    const savedUnlock = localStorage.getItem('ai-card-battler-unlocked');
    if (savedUnlock) setUnlockedCardIds(JSON.parse(savedUnlock));
    else setUnlockedCardIds(INITIAL_UNLOCKED_CARDS);
    
    const savedCoins = localStorage.getItem('ai-card-battler-coins');
    if (savedCoins) setCoins(parseInt(savedCoins));
    else setCoins(1000);

    const savedDecksLocal = localStorage.getItem('ai-card-battler-saved-decks');
    if (savedDecksLocal) setSavedDecks(JSON.parse(savedDecksLocal));

    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        if (db) {
            const userRef = doc(db, "users", u.uid);
            try {
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.coins !== undefined) setCoins(data.coins);
                else { setCoins(1000); updateDoc(userRef, { coins: 1000 }); }
                if (data.unlockedCardIds) {
                   setUnlockedCardIds(data.unlockedCardIds);
                   localStorage.setItem('ai-card-battler-unlocked', JSON.stringify(data.unlockedCardIds));
                }
                if (data.savedDecks) {
                    setSavedDecks(data.savedDecks);
                    localStorage.setItem('ai-card-battler-saved-decks', JSON.stringify(data.savedDecks));
                }
              } else {
                const initialUnlocks = INITIAL_UNLOCKED_CARDS;
                const initialCoins = 1000;
                await setDoc(userRef, { displayName: u.displayName || 'Anonymous', photoURL: u.photoURL || '', email: u.email || '', totalWins: 0, totalMatches: 0, unlockedCardIds: initialUnlocks, coins: initialCoins, savedDecks: {}, createdAt: serverTimestamp() });
                setUnlockedCardIds(initialUnlocks); setCoins(initialCoins);
              }
            } catch (e) { console.error("User sync error:", e); }
          }
      } else {
        setUser(null);
        const saved = localStorage.getItem('ai-card-battler-unlocked');
        if (saved) setUnlockedCardIds(JSON.parse(saved));
        else setUnlockedCardIds(INITIAL_UNLOCKED_CARDS);
        const savedC = localStorage.getItem('ai-card-battler-coins');
        if (savedC) setCoins(parseInt(savedC)); else setCoins(1000);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => { if (!auth) return; try { await signInWithPopup(auth, googleProvider); } catch (e) { alert("ログイン失敗"); } };
  const handleLogout = async () => { if (!auth) return; await signOut(auth); setGameState('login_screen'); };
  const canAccessGameMaster = useMemo(() => { if (!user) return false; if (ADMIN_EMAILS.length === 0) return true; return user.email && ADMIN_EMAILS.includes(user.email); }, [user]);

  const unlockCards = useCallback(async (newCardIds: number[]) => {
    setUnlockedCardIds(prev => {
      const uniqueNew = newCardIds.filter(id => !prev.includes(id));
      if (uniqueNew.length === 0) return prev;
      const newUnlocked = [...prev, ...uniqueNew].sort((a,b) => a - b);
      localStorage.setItem('ai-card-battler-unlocked', JSON.stringify(newUnlocked));
      return newUnlocked;
    });
    if (user && db && newCardIds.length > 0) updateDoc(doc(db, "users", user.uid), { unlockedCardIds: arrayUnion(...newCardIds) }).catch(console.error);
  }, [user]);

  const updateCoins = useCallback(async (amount: number) => {
      setCoins(prev => {
          const newVal = Math.max(0, prev + amount);
          localStorage.setItem('ai-card-battler-coins', newVal.toString());
          return newVal;
      });
      if (user && db) updateDoc(doc(db, "users", user.uid), { coins: increment(amount) }).catch(console.error);
  }, [user]);

  const handleBuyPack = async (cost: number, pulledCards: CardData[]) => {
      await updateCoins(-cost);
      await unlockCards(pulledCards.map(c => c.definitionId));
  };

  const handleSaveDeck = useCallback(async (slotId: string, deck: CardData[]) => {
      const deckIds = deck.map(c => c.definitionId);
      const newSavedDecks = { ...savedDecks, [slotId]: deckIds };
      setSavedDecks(newSavedDecks);
      localStorage.setItem('ai-card-battler-saved-decks', JSON.stringify(newSavedDecks));
      if (user && db) updateDoc(doc(db, "users", user.uid), { [`savedDecks.${slotId}`]: deckIds }).catch(console.error);
  }, [savedDecks, user]);

  useEffect(() => {
    if (gameState !== 'matchmaking' || !db) return;
    const q = query(collection(db, 'rooms'));
    return onSnapshot(q, (snapshot) => {
      const loadedRooms: Room[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Room;
        if (!data.roomId) data.roomId = docSnap.id;
        loadedRooms.push(data);
        let isZombie = false;
        if ((data.status === 'waiting' || data.status === 'playing') && data.hostLastActive) {
            const lastActive = data.hostLastActive.toMillis ? data.hostLastActive.toMillis() : 0;
            if (now - lastActive > 60000) isZombie = true;
        }
        if (isZombie) updateDoc(docSnap.ref, { status: 'finished' }).catch(() => {});
      });
      setRooms(loadedRooms);
    });
  }, [gameState]);

  useEffect(() => {
      if (gameMode !== 'pvp' || gameState !== 'in_game' || !currentRoomId || !db) return;
      const timer = setInterval(() => {
          if (!currentRoomId) return;
          const field = isHostRef.current ? 'hostLastActive' : 'guestLastActive';
          updateDoc(doc(db, 'rooms', currentRoomId), { [field]: serverTimestamp() }).catch(() => {});
      }, 5000);
      return () => clearInterval(timer);
  }, [gameMode, gameState, currentRoomId]);

  const cleanupGameSession = useCallback((keepConnection = false) => {
      if (!keepConnection) { if (unsubscribeRoomRef.current) unsubscribeRoomRef.current(); setCurrentRoomId(null); setIsHost(false); }
      processedMatchIdRef.current = null; setWinner(null); setBattleOutcome(null); setPlayerPlayedCard(null); setPcPlayedCard(null); setTurnPhase('player_turn');
  }, []);

  const getUpgradedCardInstance = useCallback((cardToDraw: CardData): CardData => {
    const baseId = cardToDraw.baseDefinitionId;
    const defId = levelUpMap[baseId] || cardToDraw.definitionId;
    const definition = cardCatalog[defId] || StaticCardCatalogById[defId];
    return { ...definition, id: nextCardInstanceId.current++ };
  }, [levelUpMap, cardCatalog]);

  const createNewCardInstance = useCallback((definitionId: number): CardData => {
    const definition = cardCatalog[definitionId] || StaticCardCatalogById[definitionId];
    return { ...definition, id: nextCardInstanceId.current++ };
  }, [cardCatalog]);

  const endGameByDeckOut = () => {
    let pWin = playerHP > pcHP; let cpuWin = pcHP > playerHP;
    if (gameMode === 'pvp') {
       if (isHost && currentRoomId && db) updateDoc(doc(db, 'rooms', currentRoomId), { winnerId: pWin ? 'host' : cpuWin ? 'guest' : 'draw' });
       return; 
    }
    if (pWin) { setWinner(`勝利！`); updateCoins(100); }
    else if (cpuWin) setWinner(`敗北…`);
    else setWinner(`引き分け`);
    setGameState('end');
  };

  const drawCards = useCallback((playerCount: number, pcCount: number) => {
    if (playerCount > 0) setPlayerDeck(d => { if (d.length < playerCount) { endGameByDeckOut(); return d; } setPlayerHand(h => [...h, ...d.slice(0, playerCount).map(getUpgradedCardInstance)]); return d.slice(playerCount); });
    if (pcCount > 0) setPcDeck(d => { if (d.length < pcCount) { endGameByDeckOut(); return d; } setPcHand(h => [...h, ...d.slice(0, pcCount).map(getUpgradedCardInstance)]); return d.slice(pcCount); });
  }, [getUpgradedCardInstance, playerHP, pcHP]);

  const listenToRoom = (roomId: string) => {
    if (unsubscribeRoomRef.current) unsubscribeRoomRef.current();
    unsubscribeRoomRef.current = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as Room;
      const isHostVal = isHostRef.current;
      const currentGameState = gameStateRef.current;

      if (currentGameState === 'in_game' && data.status === 'playing') {
          const now = Date.now();
          const opponentLastActive = isHostVal ? data.guestLastActive : data.hostLastActive;
          if (opponentLastActive) {
             const lastActiveMillis = opponentLastActive.toMillis();
             if (now - lastActiveMillis > 20000) {
                 if (processedMatchIdRef.current !== roomId) {
                    setWinner("通信切断による勝利"); setGameState('end'); updateCoins(100);
                    updateDoc(doc(db, 'rooms', roomId), { winnerId: isHostVal ? 'host' : 'guest', status: 'finished' });
                 }
                 return;
             }
          }
      }

      if (data.status === 'playing' && currentGameState === 'matchmaking') {
        setMatchStatus('マッチ成立！');
        setCurrentRound(1);
        processedMatchIdRef.current = null;
        setTimeout(() => {
             const pcDeckDefs = allCards.slice(0, 10).flatMap(def => [def, def]);
             startGame(playerDeck, pcDeckDefs); 
             setGameState('in_game');
        }, 1500);
      }

      if (currentGameState === 'in_game') {
          setPlayerHP(isHostVal ? data.p1Hp : data.p2Hp);
          setPcHP(isHostVal ? data.p2Hp : data.p1Hp);

          const opponentMove = isHostVal ? data.p2Move : data.p1Move;
          const myMoveOnServer = isHostVal ? data.p1Move : data.p2Move;

          if (opponentMove) {
              if (myMoveOnServer) {
                  if (JSON.stringify(pcPlayedCardRef.current) !== JSON.stringify(opponentMove)) setPcPlayedCard(opponentMove);
              } else if (pcPlayedCardRef.current?.id !== -1) {
                  setPcPlayedCard(HIDDEN_CARD);
              }
          } else if (pcPlayedCardRef.current !== null) setPcPlayedCard(null);

          if (myMoveOnServer && opponentMove) {
             const currentTp = turnPhaseRef.current;
             if (currentTp !== 'resolution_phase' && currentTp !== 'battle_animation') { setPcPlayedCard(opponentMove); setTurnPhase('resolution_phase'); }
          }

          if (data.round > currentRoundRef.current) {
             setCurrentRound(data.round); drawCards(1, 1);
             setPlayerPlayedCard(null); setPcPlayedCard(null);
             setTurnPhase('player_turn'); addLog(`Round ${data.round}`);
          }

          if (data.winnerId && processedMatchIdRef.current !== roomId) {
             processedMatchIdRef.current = roomId;
             let isWinner = (data.winnerId === 'host' && isHostVal) || (data.winnerId === 'guest' && !isHostVal);
             setWinner(data.winnerId === 'draw' ? "引き分け" : isWinner ? "勝利！" : "敗北…");
             setGameState('end');
             if (isWinner) { updateCoins(100); addLog("勝利ボーナス 100G"); }
             if (userRef.current && db) {
                 const userDocRef = doc(db, 'users', userRef.current.uid);
                 updateDoc(userDocRef, { totalMatches: increment(1), totalWins: isWinner ? increment(1) : increment(0) }).catch(() => {});
             }
          }
      }
    });
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!user || !db) return;
    cleanupGameSession(false);
    try {
        const roomRef = doc(db, 'rooms', roomId);
        const result = await runTransaction(db, async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            
            // Evidence Level 4: Explicitly clearing "ゴミ (Stale Data)" on new match start
            const baseRoomData = {
                roomId, status: 'waiting', hostId: user.uid, hostName: user.displayName || 'Unknown',
                guestId: null, guestName: null, createdAt: serverTimestamp(), hostLastActive: serverTimestamp(),
                guestLastActive: null, hostReady: true, guestReady: false, round: 1, p1Move: null, p2Move: null,
                p1Hp: INITIAL_HP, p2Hp: INITIAL_HP, winnerId: null // Crucial: clear previous winner
            };

            if (!roomDoc.exists() || (roomDoc.data() as Room).status === 'finished') {
                transaction.set(roomRef, baseRoomData); return 'host';
            }
            const data = roomDoc.data() as Room;
            if (data.status === 'waiting') {
                if (data.hostId === user.uid) return 'host';
                transaction.update(roomRef, { status: 'playing', guestId: user.uid, guestName: user.displayName || 'Unknown', guestReady: true, guestLastActive: serverTimestamp() });
                return 'guest';
            }
            if (data.hostId === user.uid) return 'host';
            if (data.guestId === user.uid) return 'guest';
            throw new Error("Full");
        });
        if (result === 'host') { setIsHost(true); setCurrentRoomId(roomId); }
        else if (result === 'guest') { setIsHost(false); setCurrentRoomId(roomId); }
    } catch (e) { alert("入室エラー"); }
  };

  useEffect(() => { if (currentRoomId) listenToRoom(currentRoomId); }, [currentRoomId]);

  const startGame = useCallback((playerDeckSetup: CardData[], pcDeckSetup: CardData[]) => {
    cleanupGameSession(true);
    nextCardInstanceId.current = 0;
    const pDeck = playerDeckSetup.map(c => createNewCardInstance(c.definitionId));
    const cDeck = pcDeckSetup.map(c => createNewCardInstance(c.definitionId));
    const shuffledPlayerDeck = shuffleDeck(pDeck);
    const shuffledPcDeck = shuffleDeck(cDeck);
    setPlayerDeck(shuffledPlayerDeck.slice(HAND_SIZE)); setPcDeck(shuffledPcDeck.slice(HAND_SIZE));
    setPlayerHand(shuffledPlayerDeck.slice(0, HAND_SIZE)); setPcHand(shuffledPcDeck.slice(0, HAND_SIZE));
    setPlayerHP(INITIAL_HP); setPcHP(INITIAL_HP); setTurnPhase('player_turn');
    setGameLog(['バトル開始！']);
    setPlayerPlayedCard(null); setPcPlayedCard(null); setSelectedCardId(null); setWinner(null);
    setBattleOutcome(null); setPlayerIsCasting(false); setPcIsCasting(false);
    setLevelUpMap({}); setLevelUpAnimationData(null);
  }, [createNewCardInstance, cleanupGameSession]);

  const resolveBattle = useCallback(() => {
    if (!playerPlayedCard || !pcPlayedCard || pcPlayedCard.id === -1) return;
    const matchup = getAttributeMatchup(playerPlayedCard.attribute, pcPlayedCard.attribute);
    let dPc = 0, dP = 0, pHeal = 0, pcHeal = 0, pDraw = 0, pcDraw = 0, pShield = 0, pcShield = 0;
    let pDef = playerPlayedCard.defense, cDef = pcPlayedCard.defense;

    if (playerPlayedCard.effect === 'PIERCING') { cDef = 0; setPlayerIsCasting(true); }
    if (pcPlayedCard.effect === 'PIERCING') { pDef = 0; setPcIsCasting(true); }

    // Logic... (Simplified for brevity but maintaining existing effects)
    if (playerPlayedCard.effect === 'DIRECT_DAMAGE') dPc += playerPlayedCard.effectValue || 0;
    else if (playerPlayedCard.effect === 'HEAL_PLAYER') pHeal = playerPlayedCard.effectValue || 0;
    else if (playerPlayedCard.effect === 'DRAW_CARD') pDraw = playerPlayedCard.effectValue || 0;
    
    if (pcPlayedCard.effect === 'DIRECT_DAMAGE') dP += pcPlayedCard.effectValue || 0;
    else if (pcPlayedCard.effect === 'HEAL_PLAYER') pcHeal = pcPlayedCard.effectValue || 0;
    else if (pcPlayedCard.effect === 'DRAW_CARD') pcDraw = pcPlayedCard.effectValue || 0;

    if (matchup === 'advantage') dPc += Math.max(0, playerPlayedCard.attack - cDef);
    else if (matchup === 'disadvantage') dP += Math.max(0, pcPlayedCard.attack - pDef);
    else { dPc += Math.max(0, playerPlayedCard.attack - cDef); dP += Math.max(0, pcPlayedCard.attack - pDef); }

    const newPcHp = Math.min(INITIAL_HP, pcHP - dPc + pcHeal);
    const newPlayerHp = Math.min(INITIAL_HP, playerHP - dP + pHeal);
    if (pDraw > 0 || pcDraw > 0) drawCards(pDraw, pcDraw);

    const finishBattle = () => {
      setBattleOutcome(null);
      if (gameMode === 'cpu') {
         setPcHP(newPcHp); setPlayerHP(newPlayerHp);
         if (newPlayerHp <= 0 || newPcHp <= 0) {
             setWinner(newPlayerHp <= 0 && newPcHp <= 0 ? "引き分け" : newPlayerHp <= 0 ? "敗北" : "勝利！");
             if (newPcHp <= 0) updateCoins(100); setGameState('end');
         } else { drawCards(1, 1); setPlayerPlayedCard(null); setPcPlayedCard(null); setTurnPhase('player_turn'); }
      } else if (gameMode === 'pvp' && currentRoomId && db && isHost) {
         let wId = (newPlayerHp <= 0 && newPcHp <= 0) ? 'draw' : newPlayerHp <= 0 ? 'guest' : newPcHp <= 0 ? 'host' : null;
         const updates: any = { p1Hp: newPlayerHp, p2Hp: newPcHp };
         if (wId) { updates.winnerId = wId; updates.status = 'finished'; }
         else { updates.p1Move = null; updates.p2Move = null; updates.round = increment(1); }
         updateDoc(doc(db, 'rooms', currentRoomId), updates);
      }
    };

    let didLvUp = false;
    if (dPc > dP && playerPlayedCard.unlocks) {
       const baseId = playerPlayedCard.baseDefinitionId;
       const currentMax = levelUpMap[baseId] || playerPlayedCard.definitionId;
       if (playerPlayedCard.unlocks > currentMax) {
         didLvUp = true; setLevelUpMap(p => ({...p, [baseId]: playerPlayedCard.unlocks! }));
         const nextDef = cardCatalog[playerPlayedCard.unlocks!] || StaticCardCatalogById[playerPlayedCard.unlocks!];
         postAnimationCallback.current = finishBattle;
         setLevelUpAnimationData({ from: playerPlayedCard, to: nextDef });
       }
    }
    if (!didLvUp) setTimeout(finishBattle, 2000);
  }, [playerPlayedCard, pcPlayedCard, playerHP, pcHP, drawCards, levelUpMap, gameMode, isHost, currentRoomId, cardCatalog]);

  useEffect(() => { if (turnPhase === 'resolution_phase') setTimeout(() => setTurnPhase('battle_animation'), 500); }, [turnPhase]);
  useEffect(() => { if (turnPhase === 'battle_animation') setTimeout(() => resolveBattle(), 500); }, [turnPhase, resolveBattle]);
  
  const handleCardSelect = (c: CardData) => { if (turnPhase === 'player_turn') setSelectedCardId(c.id === selectedCardId ? null : c.id); };
  const handleBoardClick = () => {
      if (selectedCardId !== null && turnPhase === 'player_turn') {
          const card = playerHand.find(c => c.id === selectedCardId);
          if (card) {
              setPlayerPlayedCard(card); setPlayerHand(p => p.filter(c => c.id !== selectedCardId));
              setSelectedCardId(null);
              if (gameMode === 'pvp' && currentRoomId) {
                  setTurnPhase('waiting_for_opponent');
                  updateDoc(doc(db, 'rooms', currentRoomId), { [isHost ? 'p1Move' : 'p2Move']: card });
              } else setTurnPhase('pc_turn');
          }
      }
  };

  // Evidence Level 5: Guarding against rendering incomplete state
  if (isLoadingCards && gameState !== 'login_screen') {
    return <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-amber-500 font-bold">DATA LOADING...</div>;
  }

  return (
    <div className="w-full h-screen bg-gray-900 text-white overflow-hidden font-sans select-none relative">
        <div className="absolute inset-0 bg-black/30 pointer-events-none"></div>
        {gameState !== 'login_screen' && gameState !== 'gamemaster' && (
          <div className="absolute top-0 w-full p-4 flex justify-between items-center z-50 pointer-events-none">
            <div className="pointer-events-auto">
              {user ? (
                 <div className="flex items-center gap-2 bg-black/60 p-2 rounded-lg border border-gray-600">
                    {user.photoURL && <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full" />}
                    <div className="flex flex-col">
                        <span className="text-white text-xs">{user.displayName}</span>
                        <span className="text-amber-400 text-xs font-bold">🪙 {coins}</span>
                    </div>
                    <button onClick={handleLogout} className="bg-red-600 text-white text-xs px-2 py-1 rounded ml-2">OUT</button>
                 </div>
              ) : <div className="bg-black/60 p-2 rounded-lg border border-gray-600 text-amber-400 font-bold">🪙 {coins}</div>}
            </div>
            <div className="pointer-events-auto flex gap-2">
               <button onClick={() => setShowShop(true)} className="bg-purple-600 text-white font-bold px-4 py-2 rounded-lg">SHOP</button>
               <button onClick={() => setShowRanking(true)} className="bg-amber-500 text-gray-900 font-bold px-4 py-2 rounded-lg">RANK</button>
            </div>
          </div>
        )}

        <div className="relative z-10 w-full h-full">
            {gameState === 'login_screen' && <TopScreen currentUser={user} onLogin={handleLogin} onGuestPlay={() => setGameState('deck_building')} onStartGame={() => setGameState('deck_building')} onLogout={handleLogout} onOpenShop={() => setShowShop(true)} onOpenGameMaster={canAccessGameMaster ? () => { if (window.prompt('Pass?') === GAMEMASTER_PASSWORD) setGameState('gamemaster'); } : undefined} />}
            {gameState === 'deck_building' && <DeckBuilder unlockedCards={unlockedCardIds.map(id => cardCatalog[id]).filter(Boolean)} onDeckSubmit={(d, m) => { setPlayerDeck(d); setGameMode(m); setGameState(m === 'cpu' ? 'in_game' : 'matchmaking'); if(m==='cpu') startGame(d, allCards.slice(0, 10).flatMap(x=>[x,x])); }} isGuest={!user} savedDecks={savedDecks} onSaveDeck={handleSaveDeck} cardCatalog={cardCatalog} coins={coins} />}
            {gameState === 'matchmaking' && <Matchmaking rooms={rooms} onJoinRoom={handleJoinRoom} onCancel={() => { cleanupGameSession(); setGameState('deck_building'); }} currentRoomId={currentRoomId} />}
            {gameState === 'in_game' && (
                <>
                <GameBoard turnPhase={turnPhase} playerHP={playerHP} pcHP={pcHP} playerHand={playerHand} pcHandSize={pcHand.length} pcAttributeCount={pcAttributeCount} playerDeckSize={playerDeck.length} pcDeckSize={pcDeck.length} playerPlayedCard={playerPlayedCard} pcPlayedCard={pcPlayedCard} onCardSelect={handleCardSelect} onBoardClick={handleBoardClick} selectedCardId={selectedCardId} gameLog={gameLog} playerIsCasting={playerIsCasting} pcIsCasting={pcIsCasting} battleOutcome={battleOutcome} />
                {levelUpAnimationData && <LevelUpAnimation fromCard={levelUpAnimationData.from} toCard={levelUpAnimationData.to} onAnimationComplete={() => { setLevelUpAnimationData(null); postAnimationCallback.current?.(); postAnimationCallback.current = null; }} />}
                </>
            )}
            {gameState === 'end' && <div className="text-center flex flex-col items-center justify-center h-full"><h1 className="text-6xl font-bold text-amber-300 mb-4">{winner}</h1><button onClick={() => { cleanupGameSession(); setGameState('deck_building'); }} className="bg-amber-500 text-gray-900 font-bold py-4 px-8 rounded-lg text-2xl">RETRY</button></div>}
            {showRanking && db && <RankingBoard onClose={() => setShowRanking(false)} db={db} />}
            {showShop && <Shop coins={coins} allCards={allCards} onBuyPack={handleBuyPack} onClose={() => setShowShop(false)} />}
            {gameState === 'gamemaster' && db && <GameMaster db={db} storage={storage} onClose={() => setGameState('login_screen')} />}
        </div>
    </div>
  );
};

export default App;
