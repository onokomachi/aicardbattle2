
import React, { useState, useMemo } from 'react';
import type { CardData } from '../types';
import Card from './Card';
import { DECK_SIZE, MAX_DUPLICATES } from '../constants';

interface DeckBuilderProps {
  unlockedCards: CardData[];
  onDeckSubmit: (deck: CardData[], mode: 'cpu' | 'pvp') => void;
  isGuest: boolean;
  savedDecks: Record<string, number[]>;
  onSaveDeck: (slotId: string, deck: CardData[]) => void;
  cardCatalog: Record<number, CardData>;
  coins: number; // Added
}

const DeckBuilder: React.FC<DeckBuilderProps> = ({ unlockedCards, onDeckSubmit, isGuest, savedDecks, onSaveDeck, cardCatalog, coins }) => {
  const [deck, setDeck] = useState<CardData[]>([]);
  const [activeSlot, setActiveSlot] = useState<string>('slot1');
  
  const deckCardCounts = useMemo(() => {
    return deck.reduce((acc, card) => {
      acc[card.definitionId] = (acc[card.definitionId] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
  }, [deck]);
  
  const poolCardCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const card of unlockedCards) {
         // Determine max allowed for this specific card
         const isHighLevel = (card.level || 1) > 1;
         const maxAllowed = isHighLevel ? 1 : MAX_DUPLICATES;
         
         const currentInDeck = deckCardCounts[card.definitionId] || 0;
         counts[card.definitionId] = Math.max(0, maxAllowed - currentInDeck);
    }
    return counts;
  }, [unlockedCards, deckCardCounts]);

  const addCardToDeck = (cardDef: CardData) => {
    if (deck.length >= DECK_SIZE) {
      alert(`デッキは${DECK_SIZE}枚までです。`);
      return;
    }
    
    const isHighLevel = (cardDef.level || 1) > 1;
    const maxAllowed = isHighLevel ? 1 : MAX_DUPLICATES;
    
    if ((deckCardCounts[cardDef.definitionId] || 0) >= maxAllowed) {
      alert(isHighLevel 
        ? `Lv.2以上のカードはデッキに1枚しか入れられません。` 
        : `同じカードは${MAX_DUPLICATES}枚までしか入れられません。`
      );
      return;
    }
    setDeck(prev => [...prev, cardDef]);
  };

  const removeCardFromDeck = (cardToRemove: CardData, index: number) => {
    setDeck(prev => prev.filter((_, i) => i !== index));
  };

  const handleLoadDeck = () => {
      const savedIds = savedDecks[activeSlot];
      if (!savedIds || savedIds.length === 0) {
          alert('このスロットにはデッキが保存されていません。');
          return;
      }
      if (!confirm('現在のデッキを破棄して、保存されたデッキを読み込みますか？')) return;

      const loadedDeck: CardData[] = [];
      let missingCards = false;

      savedIds.forEach(id => {
          const cardDef = cardCatalog[id]; // Use Prop instead of imported constant
          if (cardDef) {
              // unlocked check (optional but recommended)
              // We skip strictly checking "unlockedCards" prop because data sync might lag, 
              // and if they saved it, they likely had it. 
              loadedDeck.push(cardDef);
          } else {
              missingCards = true;
          }
      });

      if (missingCards) alert('一部のカードデータが見つかりませんでした。');
      setDeck(loadedDeck);
  };

  const handleSaveDeckClick = () => {
      if (deck.length !== DECK_SIZE) {
          alert(`デッキは${DECK_SIZE}枚揃っていないと保存できません。`);
          return;
      }
      if (confirm(`現在のデッキを ${activeSlot.replace('slot', 'Slot ')} に上書き保存しますか？`)) {
          onSaveDeck(activeSlot, deck);
      }
  };
  
  const isDeckValid = deck.length === DECK_SIZE;

  // Helper to get tooltip text including evolution info
  const getCardTooltip = (card: CardData) => {
      let text = `${card.name}\nATK:${card.attack} DEF:${card.defense}\n${card.description}`;
      if (card.unlocks !== undefined) {
          const nextCard = cardCatalog[card.unlocks];
          if (nextCard) {
              text += `\n\n【進化可能】\n勝利時、一定確率で「${nextCard.name}」に進化！`;
          } else {
              text += `\n\n【進化可能】\n(データ未定義: ID ${card.unlocks})`;
          }
      }
      return text;
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-white">
      <div className="flex flex-col items-center mb-2">
         <h1 className="text-4xl font-bold text-amber-300 drop-shadow-lg">デッキ構築</h1>
         <div className="text-sm text-gray-400 mt-1 flex gap-4">
             <span>Lv.2以上の強力なカードは1枚制限</span>
             <span className="text-amber-400 font-bold">所持コイン: {coins} G</span>
         </div>
      </div>
      
      {/* Save/Load Controls */}
      <div className="bg-gray-800/80 p-2 rounded-lg border border-gray-600 mb-4 flex gap-4 items-center shadow-lg">
          <div className="flex bg-gray-900 rounded-md overflow-hidden">
              {['slot1', 'slot2', 'slot3'].map(slot => (
                  <button
                    key={slot}
                    onClick={() => setActiveSlot(slot)}
                    className={`px-4 py-2 text-sm font-bold transition-colors ${activeSlot === slot ? 'bg-amber-600 text-white' : 'hover:bg-gray-700 text-gray-400'}`}
                  >
                      {slot.replace('slot', 'Slot ')}
                      <span className="ml-1 text-xs opacity-70">
                        {savedDecks[slot] ? '💾' : '(空)'}
                      </span>
                  </button>
              ))}
          </div>
          <div className="h-6 w-px bg-gray-600 mx-2"></div>
          <button 
            onClick={handleLoadDeck}
            className="bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!savedDecks[activeSlot]}
          >
              読込
          </button>
          <button 
             onClick={handleSaveDeckClick}
             className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
             disabled={!isDeckValid}
          >
              保存
          </button>
      </div>

      <div className="w-full max-w-7xl flex-grow flex gap-6 overflow-hidden">
        {/* Card Pool */}
        <div className="w-1/2 flex flex-col bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h2 className="text-xl font-bold text-amber-400 mb-2 text-center">カードプール ({unlockedCards.length}種類)</h2>
          <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2 custom-scrollbar">
            {unlockedCards.map((cardDef) => {
              const count = poolCardCounts[cardDef.definitionId] || 0;
              const isDimmed = count <= 0;
              const isHighLevel = (cardDef.level || 1) > 1;
              return (
                 <div 
                    key={cardDef.definitionId} 
                    className="relative transform hover:scale-105 transition-transform group" 
                    onClick={() => !isDimmed && addCardToDeck(cardDef)}
                    title={getCardTooltip(cardDef)}
                 >
                   <div className={`${isDimmed ? 'opacity-30' : 'cursor-pointer'}`}>
                      <Card card={cardDef} />
                   </div>
                   {!isDimmed && (
                     <div className={`absolute -top-2 -right-2 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white ${isHighLevel ? 'bg-red-600' : 'bg-blue-600'}`}>
                       {count}
                     </div>
                   )}
                 </div>
              );
            })}
          </div>
        </div>
        
        {/* Current Deck */}
        <div className="w-1/2 flex flex-col bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h2 className="text-xl font-bold text-amber-400 mb-2 text-center">あなたのデッキ ({deck.length}/{DECK_SIZE})</h2>
          <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2 custom-scrollbar">
             {deck.map((card, index) => (
                <div 
                    key={index} 
                    className="relative transform hover:scale-105 transition-transform" 
                    onClick={() => removeCardFromDeck(card, index)}
                    title={getCardTooltip(card)}
                >
                    <div className="cursor-pointer">
                        <Card card={card} />
                    </div>
                </div>
             ))}
          </div>
        </div>
      </div>
      
       <div className="flex gap-4 mt-4">
          <button
            onClick={() => onDeckSubmit(deck, 'cpu')}
            disabled={!isDeckValid}
            className={`bg-gray-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all transform hover:scale-105 border border-gray-500
              ${!isDeckValid ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-600'}`}
          >
            {isDeckValid ? 'CPU対戦 (練習)' : `あと ${DECK_SIZE - deck.length} 枚`}
          </button>

          <button
            onClick={() => onDeckSubmit(deck, 'pvp')}
            disabled={!isDeckValid || isGuest}
            className={`bg-gradient-to-r from-amber-600 to-red-600 text-white font-bold py-3 px-8 rounded-lg text-xl transition-all transform hover:scale-105 shadow-lg
              ${!isDeckValid || isGuest ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:shadow-amber-500/50'}`}
          >
            {isGuest ? '対人戦 (ログイン必須)' : isDeckValid ? 'ランクマッチ (対人戦)' : `あと ${DECK_SIZE - deck.length} 枚`}
          </button>
       </div>
    </div>
  );
};

export default DeckBuilder;
