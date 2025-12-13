
import React, { useState, useEffect, useRef } from 'react';
import type { CardData, TurnPhase, BattleOutcome, AttributeCounts } from '../types';
import Card, { CardBack } from './Card';
import GameLog from './GameLog';
import { PassionIcon, CalmIcon, HarmonyIcon } from './Icons';

interface GameBoardProps {
  turnPhase: TurnPhase;
  playerHP: number;
  pcHP: number;
  playerHand: CardData[];
  pcHandSize: number;
  pcAttributeCount: AttributeCounts;
  playerDeckSize: number;
  pcDeckSize: number;
  playerPlayedCard: CardData | null;
  pcPlayedCard: CardData | null;
  onCardSelect: (card: CardData) => void;
  onBoardClick: () => void;
  selectedCardId: number | null;
  gameLog: string[];
  playerIsCasting: boolean;
  pcIsCasting: boolean;
  battleOutcome: { player: BattleOutcome; pc: BattleOutcome } | null;
}

const usePrevious = <T,>(value: T): T | undefined => {
    const ref = useRef<T | undefined>(undefined);
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
};


const HealthBar: React.FC<{ current: number; max: number; label: string }> = ({ current, max, label }) => {
    const percentage = Math.max(0, (current / max) * 100);
    const [animationClass, setAnimationClass] = useState('');
    const prevHp = usePrevious(current);

    useEffect(() => {
        if (prevHp === undefined) return;
        if (current < prevHp) {
            setAnimationClass('animate-glow-red animate-shake');
        } else if (current > prevHp) {
            setAnimationClass('animate-glow-green');
        }

        if (animationClass) {
            const timer = setTimeout(() => setAnimationClass(''), 1000);
            return () => clearTimeout(timer);
        }
    }, [current, prevHp]);

    return (
        <div className={`w-32 h-6 sm:w-48 sm:h-7 lg:w-64 lg:h-8 bg-gray-700 rounded-full border-2 border-gray-600 shadow-inner p-0.5 ${animationClass}`}>
            <div className="relative h-full">
                <div
                    className="bg-gradient-to-r from-red-500 to-red-700 h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                ></div>
                <div className="absolute inset-0 flex justify-between items-center px-2 sm:px-4">
                    <span className="font-bold text-white text-[10px] sm:text-xs lg:text-sm drop-shadow-md">{label}</span>
                    <span className="font-bold text-white text-xs sm:text-sm lg:text-lg drop-shadow-md">{current} / {max}</span>
                </div>
            </div>
        </div>
    );
};

const AttributeTracker: React.FC<{ counts: AttributeCounts }> = ({ counts }) => {
  return (
    <div className="flex items-center space-x-2 sm:space-x-3 bg-black/30 px-2 sm:px-3 py-1 rounded-full border border-gray-600 h-6 sm:h-8 scale-90 sm:scale-100 origin-left">
      <div className="flex items-center space-x-1" title={`Passion: ${counts.passion}`}>
        <PassionIcon className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
        <span className="text-white font-bold text-xs sm:text-sm">{counts.passion}</span>
      </div>
      <div className="flex items-center space-x-1" title={`Calm: ${counts.calm}`}>
        <CalmIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
        <span className="text-white font-bold text-xs sm:text-sm">{counts.calm}</span>
      </div>
      <div className="flex items-center space-x-1" title={`Harmony: ${counts.harmony}`}>
        <HarmonyIcon className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
        <span className="text-white font-bold text-xs sm:text-sm">{counts.harmony}</span>
      </div>
    </div>
  );
};


const DeckCounter: React.FC<{ count: number }> = ({ count }) => (
    <div className="absolute bottom-0 right-0 bg-black/50 text-white text-[10px] sm:text-sm font-bold px-2 py-0.5 sm:px-3 sm:py-1 rounded-tl-lg z-10">
        山札: {count}
    </div>
);


const GameBoard: React.FC<GameBoardProps> = ({
  turnPhase,
  playerHP,
  pcHP,
  playerHand,
  pcHandSize,
  pcAttributeCount,
  playerDeckSize,
  pcDeckSize,
  playerPlayedCard,
  pcPlayedCard,
  onCardSelect,
  onBoardClick,
  selectedCardId,
  gameLog,
  playerIsCasting,
  pcIsCasting,
  battleOutcome
}) => {
  return (
    <div className="w-full h-full max-h-screen flex flex-col justify-between items-center p-2 sm:p-4 relative overflow-hidden" onClick={onBoardClick}>
      
      {/* Waiting Indicator */}
      {turnPhase === 'waiting_for_opponent' && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div className="bg-black/70 px-6 py-4 rounded-xl border border-amber-500/50 flex flex-col items-center gap-2 backdrop-blur-sm">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                <div className="text-amber-200 font-bold text-lg animate-pulse shadow-black drop-shadow-md">
                   対戦相手のカード選択を<br/>待っています...
                </div>
            </div>
        </div>
      )}

      {/* PC Area */}
      <div className="w-full flex justify-center items-center flex-col space-y-1 sm:space-y-4 pt-8 sm:pt-0">
        <div className="flex items-center space-x-2 sm:space-x-4">
            <HealthBar current={pcHP} max={20} label="相手" />
            <AttributeTracker counts={pcAttributeCount} />
        </div>
        {/* PC Hand Container - Responsive Height */}
        <div className="flex justify-center items-center h-28 xs:h-36 sm:h-48 md:h-52 lg:h-60 space-x-[-1.5rem] sm:space-x-[-1rem] md:space-x-1 lg:space-x-2">
            {[...Array(pcHandSize)].map((_, i) => (
              <div key={i} className="opacity-70 relative transform scale-90 sm:scale-100">
                <CardBack />
                {i === 0 && <DeckCounter count={pcDeckSize} />}
              </div>
            ))}
        </div>
      </div>

      {/* Battle Field */}
      <div className="w-full flex-grow flex justify-center items-center min-h-0 space-x-2 sm:space-x-8">
        <div className="flex items-center justify-center">
            {playerPlayedCard && (
              <Card 
                card={playerPlayedCard} 
                isCastingEffect={playerIsCasting}
                isBattling={turnPhase === 'battle_animation'}
                battleOutcome={battleOutcome?.player ?? null}
                owner='player'
              />
            )}
        </div>
        <div className="text-amber-400 text-xl sm:text-3xl lg:text-4xl font-black">VS</div>
        <div className="flex items-center justify-center">
            {pcPlayedCard && (
              <Card 
                card={pcPlayedCard} 
                isCastingEffect={pcIsCasting}
                isBattling={turnPhase === 'battle_animation'}
                battleOutcome={battleOutcome?.pc ?? null}
                owner='pc'
              />
            )}
        </div>
      </div>

      {/* Player Area */}
      <div className="w-full flex justify-center items-center flex-col space-y-1 sm:space-y-4 pb-2">
         {/* Player Hand Container - Responsive Height and Spacing */}
         <div className="h-28 xs:h-36 sm:h-48 md:h-52 lg:h-60 2xl:h-72 flex justify-center items-end space-x-[-2.5rem] sm:space-x-[-3rem] md:space-x-[-3.5rem] lg:space-x-[-4rem] pb-2 sm:pb-4" onClick={(e) => e.stopPropagation()}>
            <div className="relative mr-2 sm:mr-4 transform scale-90 sm:scale-100 origin-bottom">
                <CardBack />
                <DeckCounter count={playerDeckSize} />
            </div>
            {playerHand.map(card => (
              <Card 
                key={card.id} 
                card={card}
                onClick={() => onCardSelect(card)}
                isPlayable={turnPhase === 'player_turn'}
                inHand={true}
                isSelected={selectedCardId === card.id}
              />
            ))}
        </div>
        <HealthBar current={playerHP} max={20} label="あなた" />
      </div>

      <GameLog messages={gameLog} />
    </div>
  );
};

export default GameBoard;
