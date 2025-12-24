
import React from 'react';
import type { Room } from '../types';
import { User } from 'firebase/auth';

interface MatchmakingProps {
  rooms: Room[];
  onJoinRoom: (roomId: string) => void;
  onCancel: () => void;
  currentRoomId: string | null;
  user: User | null;
}

const Matchmaking: React.FC<MatchmakingProps> = ({ rooms, onJoinRoom, onCancel, currentRoomId, user }) => {
  // 1〜15番の部屋IDを生成
  const roomIds = Array.from({ length: 15 }, (_, i) => `room-${i + 1}`);
  const userUid = user?.uid.trim();

  // 自分が現在どこかの部屋のホストであるか確認
  const hostingRoom = rooms.find(r => r.hostId?.trim() === userUid && r.status !== 'finished');

  const getRoomInfo = (roomId: string) => {
    const room = rooms.find(r => r.roomId === roomId);
    
    // 自分がこの部屋のホストまたはゲストであるか
    const isMyHostRoom = room?.hostId?.trim() === userUid;
    const isMyGuestRoom = room?.guestId?.trim() === userUid;
    const isMyRoomInGeneral = isMyHostRoom || isMyGuestRoom;

    // 部屋データがない、または終了している場合は「空室」扱い
    if (!room || room.status === 'finished') {
        const canCreate = !hostingRoom;
        return {
            statusText: '空室 (0/2)',
            styleClass: canCreate 
                ? 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-300 shadow-lg'
                : 'bg-gray-800/50 border-gray-700 text-gray-500 opacity-50 cursor-not-allowed',
            icon: '🚪',
            isClickable: canCreate,
            label: '入室する'
        };
    }
    
    // 自分が関わっている部屋
    if (isMyRoomInGeneral) {
        return {
            statusText: room.status === 'waiting' ? '募集中 (1/2)' : '対戦中 (2/2)',
            styleClass: 'bg-amber-900/80 border-amber-400 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.6)] animate-pulse ring-4 ring-amber-400 ring-offset-2 ring-offset-gray-900',
            icon: '🌟',
            isClickable: true,
            label: '復帰する',
            isMine: true
        };
    }

    // 誰かが待機中（他人の部屋）
    if (room.status === 'waiting') {
        const canJoin = !hostingRoom;
        return {
            statusText: '募集中 (1/2)',
            styleClass: canJoin
                 ? 'bg-green-900/80 hover:bg-green-800 border-green-500 text-green-200 animate-pulse shadow-[0_0_15px_rgba(72,187,120,0.4)]'
                 : 'bg-green-900/30 border-green-900/50 text-green-700 opacity-50 cursor-not-allowed',
            icon: '👤',
            isClickable: canJoin,
            label: '挑戦する'
        };
    }
    
    // 対戦中（他人の部屋）
    return {
        statusText: '対戦中 (2/2)',
        styleClass: 'bg-red-900/30 border-red-900/50 text-red-700 opacity-40 cursor-not-allowed',
        icon: '⚔️',
        isClickable: false,
        label: '満員'
    };
  };

  return (
    <div className="w-full h-full flex flex-col items-center p-4 bg-gray-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30 pointer-events-none"></div>
      
      <div className="z-10 w-full max-w-6xl flex flex-col h-full">
         <div className="flex justify-between items-center mb-6 p-4 border-b border-gray-700 bg-gray-900/80 backdrop-blur-sm rounded-t-lg shadow-2xl">
             <div>
                <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600">バトルロビー</h2>
                <p className="text-gray-400 text-sm mt-1">
                    {hostingRoom 
                        ? 'あなたは現在 ROOM ' + hostingRoom.roomId.replace('room-', '') + ' で待機しています。' 
                        : '空いている部屋を選んで入室してください。同じアカウントの他タブから入ることはできません。'}
                </p>
             </div>
             <button 
                onClick={onCancel} 
                className={`
                    px-8 py-2 rounded-full text-sm font-bold transition-all border shadow-lg
                    ${hostingRoom 
                        ? 'bg-red-900 hover:bg-red-800 border-red-500 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 border-gray-500 text-gray-200'
                    }
                `}
             >
                {hostingRoom ? 'ロビーを閉じる' : 'デッキ構築に戻る'}
             </button>
         </div>
         
         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 overflow-y-auto p-6 custom-scrollbar flex-grow bg-gray-800/20 rounded-b-lg border border-t-0 border-gray-700">
             {roomIds.map(roomId => {
                 const info = getRoomInfo(roomId);
                 return (
                     <div 
                        key={roomId}
                        onClick={() => info.isClickable && onJoinRoom(roomId)}
                        className={`
                            relative h-44 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-300
                            ${info.styleClass}
                            ${info.isClickable ? 'cursor-pointer hover:scale-105 active:scale-95' : ''}
                        `}
                     >
                        <div className="absolute top-2 left-4 font-mono text-[10px] opacity-40">NO.{roomId.replace('room-', '')}</div>
                        
                        {(info as any).isMine && (
                          <div className="absolute -top-3 bg-amber-500 text-black text-[10px] font-black px-3 py-1 rounded-full shadow-lg border-2 border-white z-20">
                            YOUR ROOM
                          </div>
                        )}

                        <div className="text-5xl filter drop-shadow-lg mb-1">{info.icon}</div>
                        <div className="font-black text-xl tracking-tighter">ROOM {roomId.replace('room-', '')}</div>
                        
                        <div className="flex flex-col items-center gap-1">
                            <div className="text-[10px] font-bold px-3 py-0.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/10">
                                {info.statusText}
                            </div>
                            <div className="text-xs font-black uppercase opacity-80 tracking-widest text-white/90">
                                {info.label}
                            </div>
                        </div>
                     </div>
                 );
             })}
         </div>
      </div>
    </div>
  );
};

export default Matchmaking;
