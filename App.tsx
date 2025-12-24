
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

  const { allCards, cardCatalog, isLoading: isLoadingCards } = useCardData(db);

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

  const isCalculatingRef = useRef(false);
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
    if (gameMode === 'cpu' && turnPhase === 'pc_turn' && gameState === 'in_game') {
      const timer = setTimeout(() => {
        if (pcHand.length > 0) {
          const randomIndex = Math.floor(Math.random() * pcHand.length);
          const selectedCard = pcHand[randomIndex];
          setPcPlayedCard(selectedCard);
          setPcHand(prev => prev.filter((_, i) => i !== randomIndex));
          setTurnPhase('resolution_phase');
        }
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [turnPhase, gameMode, gameState, pcHand.length]);

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
                if (data.unlockedCardIds) setUnlockedCardIds(data.unlockedCardIds);
                if (data.savedDecks) setSavedDecks(data.savedDecks);
              }
            } catch (e) { console.error("User sync error:", e); }
          }
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

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
      const newCardIds = pulledCards.map(c => c.definitionId);
      setUnlockedCardIds(prev => {
          const newUnlocked = [...new Set([...prev, ...newCardIds])].sort((a,b) => a - b);
          localStorage.setItem('ai-card-battler-unlocked', JSON.stringify(newUnlocked));
          return newUnlocked;
      });
      if (user && db) updateDoc(doc(db, "users", user.uid), { unlockedCardIds: arrayUnion(...newCardIds) }).catch(console.error);
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
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Room;
        if (!data.roomId) data.roomId = docSnap.id;
        loadedRooms.push(data);
      });
      setRooms(loadedRooms);
    });
  }, [gameState]);

  const cleanupGameSession = useCallback((keepConnection = false) => {
      if (!keepConnection) { if (unsubscribeRoomRef.current) unsubscribeRoomRef.current(); setCurrentRoomId(null); setIsHost(false); }
      processedMatchIdRef.current = null; setWinner(null); setBattleOutcome(null); setPlayerPlayedCard(null); setPcPlayedCard(null); setTurnPhase('player_turn');
      isCalculatingRef.current = false;
  }, []);

  const handleLogin = async () => {
    if (!auth || !googleProvider) return;
    try {
      await signInWithPopup(auth, googleProvider);
      setGameState('login_screen');
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setGameState('login_screen');
      cleanupGameSession();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const canAccessGameMaster = useMemo(() => {
    if (ADMIN_EMAILS.length === 0) return true;
    return user && user.email && ADMIN_EMAILS.includes(user.email);
  }, [user]);

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

  const drawCards = useCallback((playerCount: number, pcCount: number) => {
    if (playerCount > 0) setPlayerDeck(d => { if (d.length < playerCount) return d; setPlayerHand(h => [...h, ...d.slice(0, playerCount).map(getUpgradedCardInstance)]); return d.slice(playerCount); });
    if (pcCount > 0) setPcDeck(d => { if (d.length < pcCount) return d; setPcHand(h => [...h, ...d.slice(0, pcCount).map(getUpgradedCardInstance)]); return d.slice(pcCount); });
  }, [getUpgradedCardInstance]);

  const listenToRoom = (roomId: string) => {
    if (unsubscribeRoomRef.current) unsubscribeRoomRef.current();
    unsubscribeRoomRef.current = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
      if (!snapshot.exists() || isCalculatingRef.current) return;
      
      const data = snapshot.data() as Room;
      const isHostVal = isHostRef.current;
      const currentGameState = gameStateRef.current;

      if (data.status === 'playing' && currentGameState === 'matchmaking') {
        setCurrentRound(1);
        processedMatchIdRef.current = null;
        setTimeout(() => {
             const pcDeckDefs = allCards.slice(0, 10).flatMap(def => [def, def]);
             startGame(playerDeck, pcDeckDefs, data);
             setGameState('in_game');
        }, 500);
      }

      if (currentGameState === 'in_game') {
          setPlayerHP(isHostVal ? data.p1Hp : data.p2Hp);
          setPcHP(isHostVal ? data.p2Hp : data.p1Hp);

          const opponentMove = isHostVal ? data.p2Move : data.p1Move;
          const myMoveOnServer = isHostVal ? data.p1Move : data.p2Move;

          if (opponentMove && !myMoveOnServer) {
              if (pcPlayedCardRef.current?.id !== -1) setPcPlayedCard(HIDDEN_CARD);
          } else if (opponentMove && myMoveOnServer) {
             const currentTp = turnPhaseRef.current;
             if (currentTp !== 'resolution_phase' && currentTp !== 'battle_animation') { 
                 setPcPlayedCard(opponentMove); 
                 setTurnPhase('resolution_phase'); 
             }
          }

          if (data.round > currentRoundRef.current) {
             setCurrentRound(data.round); drawCards(1, 1);
             setPlayerPlayedCard(null); setPcPlayedCard(null);
             setTurnPhase('player_turn');
          }

          if (data.winnerId && processedMatchIdRef.current !== roomId) {
             processedMatchIdRef.current = roomId;
             let isWinner = (data.winnerId === 'host' && isHostVal) || (data.winnerId === 'guest' && !isHostVal);
             setWinner(data.winnerId === 'draw' ? "引き分け" : isWinner ? "勝利！" : "敗北…");
             setGameState('end');
             if (isWinner) updateCoins(100);
          }
      }
    });
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!user || !db) return;
    cleanupGameSession(false);
    try {
        const roomRef = doc(db, 'rooms', roomId);
        const userUid = user.uid.trim();

        const result = await runTransaction(db, async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            const baseRoomData = {
                roomId, status: 'waiting', hostId: userUid, hostName: user.displayName || 'Unknown',
                guestId: null, guestName: null, createdAt: serverTimestamp(), hostLastActive: serverTimestamp(),
                guestLastActive: null, hostReady: true, guestReady: false, round: 1, p1Move: null, p2Move: null,
                p1Hp: INITIAL_HP, p2Hp: INITIAL_HP, winnerId: null
            };

            if (!roomDoc.exists() || (roomDoc.data() as Room).status === 'finished') {
                transaction.set(roomRef, baseRoomData); 
                return 'host';
            }

            const data = roomDoc.data() as Room;
            const existingHostId = (data.hostId || '').trim();
            const existingGuestId = (data.guestId || '').trim();

            // 自分がホストとして既に入っているならホストとして復帰
            if (existingHostId === userUid) return 'host';
            
            // 自分がゲストとして既に入っているならゲストとして復帰
            if (existingGuestId === userUid) return 'guest';

            // 空室（待ち状態）ならゲストとして参加
            if (data.status === 'waiting') {
                transaction.update(roomRef, { 
                    status: 'playing', 
                    guestId: userUid, 
                    guestName: user.displayName || 'Unknown', 
                    guestReady: true, 
                    guestLastActive: serverTimestamp() 
                });
                return 'guest';
            }
            
            throw new Error("ROOM_FULL");
        });
        setIsHost(result === 'host');
        setCurrentRoomId(roomId);
    } catch (e: any) { 
      if (e.message === "ROOM_FULL") alert("この部屋は満員です。");
      else alert("入室エラーが発生しました。");
    }
  };

  useEffect(() => { if (currentRoomId) listenToRoom(currentRoomId); }, [currentRoomId]);

  const startGame = useCallback((playerDeckSetup: CardData[], pcDeckSetup: CardData[], roomData?: Room) => {
    cleanupGameSession(true);
    nextCardInstanceId.current = 0;
    const pDeck = playerDeckSetup.map(c => createNewCardInstance(c.definitionId));
    const cDeck = pcDeckSetup.map(c => createNewCardInstance(c.definitionId));
    const shuffledPlayerDeck = shuffleDeck(pDeck);
    const shuffledPcDeck = shuffleDeck(cDeck);
    setPlayerDeck(shuffledPlayerDeck.slice(HAND_SIZE)); setPcDeck(shuffledPcDeck.slice(HAND_SIZE));
    setPlayerHand(shuffledPlayerDeck.slice(0, HAND_SIZE)); setPcHand(shuffledPcDeck.slice(0, HAND_SIZE));
    if (roomData) {
        setPlayerHP(isHostRef.current ? roomData.p1Hp : roomData.p2Hp);
        setPcHP(isHostRef.current ? roomData.p2Hp : roomData.p1Hp);
    } else {
        setPlayerHP(INITIAL_HP); setPcHP(INITIAL_HP);
    }
    setTurnPhase('player_turn');
    setGameLog(['バトル開始！']);
    setPlayerPlayedCard(null); setPcPlayedCard(null); setSelectedCardId(null); setWinner(null);
    setBattleOutcome(null); setPlayerIsCasting(false); setPcIsCasting(false);
    setLevelUpMap({}); setLevelUpAnimationData(null);
  }, [createNewCardInstance, cleanupGameSession]);

  const resolveBattle = useCallback(async () => {
    if (!playerPlayedCard || !pcPlayedCard || pcPlayedCard.id === -1) return;
    isCalculatingRef.current = true;
    
    // 1. 各種変数の初期化
    const matchup = getAttributeMatchup(playerPlayedCard.attribute, pcPlayedCard.attribute);
    let dPc = 0, dP = 0, pHeal = 0, pcHeal = 0, pDraw = 0, pcDraw = 0;
    
    // 計算用攻撃力/防御力のクローン
    let pAtk = playerPlayedCard.attack;
    let pDef = playerPlayedCard.defense;
    let cAtk = pcPlayedCard.attack;
    let cDef = pcPlayedCard.defense;

    // 2. 特殊エフェクト（計算前フェーズ: SHIELD / BERSERK）
    // Player SHIELD
    if (playerPlayedCard.effect === 'SHIELD') {
        pDef += playerPlayedCard.effectValue || 0;
        setPlayerIsCasting(true);
        addLog(`あなたの「${playerPlayedCard.name}」のシールド！防御力が上昇した！`);
    }
    // PC SHIELD
    if (pcPlayedCard.effect === 'SHIELD') {
        cDef += pcPlayedCard.effectValue || 0;
        setPcIsCasting(true);
        addLog(`相手の「${pcPlayedCard.name}」のシールド！防御力が上昇した！`);
    }

    // Player BERSERK
    if (playerPlayedCard.effect === 'BERSERK' && playerHP <= 10) {
        pAtk += playerPlayedCard.effectValue || 0;
        setPlayerIsCasting(true);
        addLog(`あなたの「${playerPlayedCard.name}」のバーサク！窮地で攻撃力が上昇した！`);
    }
    // PC BERSERK
    if (pcPlayedCard.effect === 'BERSERK' && pcHP <= 10) {
        cAtk += pcPlayedCard.effectValue || 0;
        setPcIsCasting(true);
        addLog(`相手の「${pcPlayedCard.name}」のバーサク！窮地で攻撃力が上昇した！`);
    }

    // PIERCING (貫通)
    if (playerPlayedCard.effect === 'PIERCING') { cDef = 0; setPlayerIsCasting(true); addLog(`「${playerPlayedCard.name}」の貫通！`); }
    if (pcPlayedCard.effect === 'PIERCING') { pDef = 0; setPcIsCasting(true); addLog(`「${pcPlayedCard.name}」の貫通！`); }

    // 3. 基本ダメージ計算（属性マッチアップ適用）
    if (matchup === 'advantage') {
        dPc += Math.max(0, pAtk - cDef);
    } else if (matchup === 'disadvantage') {
        dP += Math.max(0, cAtk - pDef);
    } else {
        dPc += Math.max(0, pAtk - cDef);
        dP += Math.max(0, cAtk - pDef);
    }

    // 4. 特殊エフェクト（計算中フェーズ: 直接ダメージ / 回復 / ドレイン等）
    // Player Effects
    if (playerPlayedCard.effect === 'DIRECT_DAMAGE') {
        dPc += playerPlayedCard.effectValue || 0;
        setPlayerIsCasting(true);
    } else if (playerPlayedCard.effect === 'HEAL_PLAYER') {
        pHeal += playerPlayedCard.effectValue || 0;
        setPlayerIsCasting(true);
    } else if (playerPlayedCard.effect === 'LIFE_DRAIN') {
        const drain = playerPlayedCard.effectValue || 0;
        dPc += drain;
        pHeal += drain;
        setPlayerIsCasting(true);
        addLog(`「${playerPlayedCard.name}」のライフドレイン！${drain}吸収した！`);
    } else if (playerPlayedCard.effect === 'RECOIL') {
        dP += playerPlayedCard.effectValue || 0;
        setPlayerIsCasting(true);
        addLog(`「${playerPlayedCard.name}」の捨て身の攻撃！反動ダメージを受けた！`);
    } else if (playerPlayedCard.effect === 'DRAW_CARD') {
        pDraw = playerPlayedCard.effectValue || 0;
    } else if (playerPlayedCard.effect === 'DISCARD_HAND') {
      const discardCount = playerPlayedCard.effectValue || 1;
      setPcHand(prev => {
        if (prev.length === 0) return prev;
        const newHand = [...prev];
        for (let i = 0; i < discardCount; i++) {
          if (newHand.length === 0) break;
          const randomIndex = Math.floor(Math.random() * newHand.length);
          newHand.splice(randomIndex, 1);
        }
        return newHand;
      });
      addLog(`あなたの「${playerPlayedCard.name}」の効果！相手の手札を捨てさせた！`);
      setPlayerIsCasting(true);
    }

    // PC Effects
    if (pcPlayedCard.effect === 'DIRECT_DAMAGE') {
        dP += pcPlayedCard.effectValue || 0;
        setPcIsCasting(true);
    } else if (pcPlayedCard.effect === 'HEAL_PLAYER') {
        pcHeal += pcPlayedCard.effectValue || 0;
        setPcIsCasting(true);
    } else if (pcPlayedCard.effect === 'LIFE_DRAIN') {
        const drain = pcPlayedCard.effectValue || 0;
        dP += drain;
        pcHeal += drain;
        setPcIsCasting(true);
        addLog(`相手の「${pcPlayedCard.name}」のライフドレイン！${drain}吸収された！`);
    } else if (pcPlayedCard.effect === 'RECOIL') {
        dPc += pcPlayedCard.effectValue || 0;
        setPcIsCasting(true);
        addLog(`相手の「${pcPlayedCard.name}」の捨て身の攻撃！相手も反動を受けた！`);
    } else if (pcPlayedCard.effect === 'DRAW_CARD') {
        pcDraw = pcPlayedCard.effectValue || 0;
    } else if (pcPlayedCard.effect === 'DISCARD_HAND') {
      const discardCount = pcPlayedCard.effectValue || 1;
      setPlayerHand(prev => {
        if (prev.length === 0) return prev;
        const newHand = [...prev];
        for (let i = 0; i < discardCount; i++) {
          if (newHand.length === 0) break;
          const randomIndex = Math.floor(Math.random() * newHand.length);
          newHand.splice(randomIndex, 1);
        }
        return newHand;
      });
      addLog(`相手の「${pcPlayedCard.name}」の効果！あなたの手札が捨てられた！`);
      setPcIsCasting(true);
    }

    // 5. 特殊エフェクト（計算後フェーズ: REFLECT）
    if (playerPlayedCard.effect === 'REFLECT' && dP > 0) {
        const reflectVal = playerPlayedCard.effectValue || 0;
        dPc += reflectVal;
        setPlayerIsCasting(true);
        addLog(`「${playerPlayedCard.name}」の反射！相手に${reflectVal}ダメージ！`);
    }
    if (pcPlayedCard.effect === 'REFLECT' && dPc > 0) {
        const reflectVal = pcPlayedCard.effectValue || 0;
        dP += reflectVal;
        setPcIsCasting(true);
        addLog(`相手の「${pcPlayedCard.name}」の反射！あなたに${reflectVal}ダメージ！`);
    }

    // 6. HPの最終確定
    const newPcHp = Math.min(INITIAL_HP, pcHP - dPc + pcHeal);
    const newPlayerHp = Math.min(INITIAL_HP, playerHP - dP + pHeal);
    if (pDraw > 0 || pcDraw > 0) drawCards(pDraw, pcDraw);

    const finishBattle = async () => {
      setBattleOutcome(null);
      isCalculatingRef.current = false;
      
      const isHostVal = isHostRef.current;
      const nextPHand = playerHand.length + pDraw;
      const pOutOfCards = nextPHand === 0 && playerDeck.length === 0;

      if (gameMode === 'cpu') {
         setPcHP(newPcHp); setPlayerHP(newPlayerHp);
         const pcOutOfCards = pcHand.length === 0 && pcDeck.length === 0;
         const pLost = newPlayerHp <= 0 || pOutOfCards;
         const pcLost = newPcHp <= 0 || pcOutOfCards;

         if (pLost || pcLost) {
             if (pOutOfCards && newPlayerHp > 0) addLog("手札と山札が尽きました！");
             if (pcOutOfCards && newPcHp > 0) addLog("相手の手札と山札が尽きました！");
             setWinner(pLost && pcLost ? "引き分け" : pLost ? "敗北" : "勝利！");
             if (pcLost && !pLost) updateCoins(100); setGameState('end');
         } else { drawCards(1, 1); setPlayerPlayedCard(null); setPcPlayedCard(null); setTurnPhase('player_turn'); }
      } else if (gameMode === 'pvp' && currentRoomId && db && isHostVal) {
         const p1Hp = newPlayerHp;
         const p2Hp = newPcHp;
         let wId = (p1Hp <= 0 && p2Hp <= 0) ? 'draw' : p1Hp <= 0 ? 'guest' : p2Hp <= 0 ? 'host' : null;
         
         const updates: any = { p1Hp: p1Hp, p2Hp: p2Hp, p1Move: null, p2Move: null };
         if (wId) { updates.winnerId = wId; updates.status = 'finished'; }
         else { updates.round = increment(1); }
         await updateDoc(doc(db, 'rooms', currentRoomId), updates);
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
    if (!didLvUp) setTimeout(finishBattle, 1800);
  }, [playerPlayedCard, pcPlayedCard, playerHP, pcHP, drawCards, levelUpMap, gameMode, isHost, currentRoomId, cardCatalog, addLog, playerHand.length, playerDeck.length, pcHand.length, pcDeck.length]);

  useEffect(() => { if (turnPhase === 'resolution_phase') setTimeout(() => setTurnPhase('battle_animation'), 400); }, [turnPhase]);
  useEffect(() => { if (turnPhase === 'battle_animation') resolveBattle(); }, [turnPhase, resolveBattle]);
  
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
            {gameState === 'matchmaking' && <Matchmaking rooms={rooms} onJoinRoom={handleJoinRoom} onCancel={() => { cleanupGameSession(); setGameState('deck_building'); }} currentRoomId={currentRoomId} user={user} />}
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
