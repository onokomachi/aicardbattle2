
import React, { useState } from 'react';
import type { CardData } from '../types';
import Card, { CardBack } from './Card';

interface ShopProps {
  coins: number;
  allCards: CardData[];
  onBuyPack: (cost: number, pulledCards: CardData[]) => Promise<void>;
  onClose: () => void;
}

const Shop: React.FC<ShopProps> = ({ coins, allCards, onBuyPack, onClose }) => {
  const PACK_COST = 500;
  const CARDS_PER_PACK = 3;
  
  const [isOpening, setIsOpening] = useState(false);
  const [pulledCards, setPulledCards] = useState<CardData[]>([]);
  const [phase, setPhase] = useState<'menu' | 'animating' | 'reveal'>('menu');

  const handleBuy = async () => {
    if (coins < PACK_COST) {
      alert("コインが足りません！");
      return;
    }
    
    setPhase('animating');
    setIsOpening(true);

    // Gacha Logic
    const newCards: CardData[] = [];
    const lv1Cards = allCards.filter(c => (c.level || 1) === 1);
    const highLvCards = allCards.filter(c => (c.level || 1) > 1);

    for (let i = 0; i < CARDS_PER_PACK; i++) {
        // 5% chance for high level card, 95% for Lv1
        const isRare = Math.random() < 0.05;
        let pool = isRare ? highLvCards : lv1Cards;
        
        // Fallback if pool is empty (e.g. no high level cards defined)
        if (pool.length === 0) pool = allCards;

        const randomCard = pool[Math.floor(Math.random() * pool.length)];
        newCards.push(randomCard);
    }

    // Artificial delay for animation
    setTimeout(async () => {
        await onBuyPack(PACK_COST, newCards);
        setPulledCards(newCards);
        setPhase('reveal');
        setIsOpening(false);
    }, 2000);
  };

  const handleReset = () => {
      setPhase('menu');
      setPulledCards([]);
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center text-white p-4">
      {/* Header */}
      <div className="absolute top-0 w-full p-4 flex justify-between items-center bg-gray-900 border-b border-gray-700">
         <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-amber-400">カードショップ</h2>
            <div className="bg-gray-800 px-3 py-1 rounded-full border border-amber-500/50 flex items-center gap-2">
                <span className="text-sm">💰</span>
                <span className="font-mono text-lg sm:text-xl">{coins}</span>
            </div>
         </div>
         <button 
           onClick={onClose} 
           disabled={isOpening} 
           className="text-gray-400 hover:text-white flex items-center gap-1 transition-colors group"
         >
            <span className="text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">閉じる</span>
            <span className="text-2xl">✕</span>
         </button>
      </div>

      <div className="flex-grow flex items-center justify-center w-full max-w-5xl">
         {phase === 'menu' && (
             <div className="flex flex-col items-center gap-8 animate-level-up-reveal">
                 <div className="relative group cursor-pointer" onClick={handleBuy}>
                    <div className="absolute inset-0 bg-amber-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity rounded-full"></div>
                    <div className="w-56 h-72 sm:w-64 sm:h-80 bg-gradient-to-br from-gray-800 to-gray-900 border-4 border-amber-500 rounded-xl flex flex-col items-center justify-center shadow-2xl transform group-hover:scale-105 transition-transform">
                        <div className="text-5xl sm:text-6xl mb-4">🎴</div>
                        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">スタンダードパック</h3>
                        <p className="text-gray-400 text-xs sm:text-sm mb-4">全種類のカードが出現</p>
                        <div className="bg-black/50 px-4 py-2 rounded text-amber-300 font-bold border border-amber-500/30">
                            {PACK_COST} コイン
                        </div>
                    </div>
                 </div>
                 
                 <div className="flex flex-col items-center gap-4">
                    <p className="text-gray-400 text-sm">クリックして購入 (3枚入り)</p>
                    <button 
                      onClick={onClose}
                      className="mt-4 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 px-10 rounded-xl border border-gray-600 transition-all hover:scale-105 shadow-lg flex items-center gap-2"
                    >
                      <span>⬅️</span> デッキ構築に戻る
                    </button>
                 </div>
             </div>
         )}

         {phase === 'animating' && (
             <div className="flex flex-col items-center">
                 <div className="animate-shake">
                    <CardBack className="w-48 h-72 border-4 border-white shadow-[0_0_50px_rgba(255,255,255,0.5)]" />
                 </div>
                 <p className="mt-8 text-xl font-bold text-white animate-pulse">開封中...</p>
             </div>
         )}

         {phase === 'reveal' && (
             <div className="flex flex-col items-center w-full">
                 <h3 className="text-3xl font-bold text-amber-300 mb-8 animate-level-up-flash">GET!</h3>
                 <div className="flex flex-wrap justify-center gap-4 sm:gap-8 mb-8">
                     {pulledCards.map((card, idx) => (
                         <div key={idx} className="animate-level-up-reveal" style={{ animationDelay: `${idx * 0.2}s` }}>
                             <div className="relative transform hover:scale-110 transition-transform duration-300">
                                <Card card={card} />
                                {(card.level || 1) > 1 && (
                                    <div className="absolute -top-4 -right-4 bg-yellow-500 text-black font-bold w-12 h-12 flex items-center justify-center rounded-full border-4 border-white shadow-lg animate-bounce">
                                        RARE
                                    </div>
                                )}
                             </div>
                         </div>
                     ))}
                 </div>
                 <div className="flex gap-4">
                     <button 
                        onClick={handleReset}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-lg"
                     >
                        戻る
                     </button>
                     <button 
                        onClick={handleBuy}
                        disabled={coins < PACK_COST}
                        className={`font-bold py-3 px-8 rounded-lg transition-colors ${coins < PACK_COST ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500 text-white'}`}
                     >
                        もう一度引く ({PACK_COST})
                     </button>
                 </div>
             </div>
         )}
      </div>
    </div>
  );
};

export default Shop;
