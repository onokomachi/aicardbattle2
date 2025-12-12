
import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, setDoc } from 'firebase/firestore';
import type { Room, CardData, Attribute, EffectType } from '../types';

interface UserData {
  id: string;
  displayName: string;
  email: string;
  totalWins: number;
  totalMatches: number;
  unlockedCardIds: number[];
  createdAt: any;
}

// FirestoreのドキュメントIDを含むカードデータ型
interface FirestoreCardData extends CardData {
  firestoreId: string;
}

interface GameMasterProps {
  db: any;
  onClose: () => void;
}

const GameMaster: React.FC<GameMasterProps> = ({ db, onClose }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'rooms' | 'cards'>('users');
  const [users, setUsers] = useState<UserData[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cards, setCards] = useState<FirestoreCardData[]>([]);

  // カード編集用State
  const [editingCard, setEditingCard] = useState<FirestoreCardData | null>(null);
  const [isNewCard, setIsNewCard] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<CardData>>({});

  // フィルター用State
  const [cardSearchTerm, setCardSearchTerm] = useState('');
  const [cardFilterAttribute, setCardFilterAttribute] = useState<Attribute | 'ALL'>('ALL');

  // 既存の画像ファイル名リスト（入力補完用）
  const existingImages = useMemo(() => {
    return Array.from(new Set(cards.map(c => c.image))).sort();
  }, [cards]);

  // フィルタリングされたカードリスト
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
        const matchesSearch = 
            card.name.includes(cardSearchTerm) || 
            card.definitionId.toString().includes(cardSearchTerm) ||
            card.description.includes(cardSearchTerm);
        const matchesAttr = cardFilterAttribute === 'ALL' || card.attribute === cardFilterAttribute;
        return matchesSearch && matchesAttr;
    });
  }, [cards, cardSearchTerm, cardFilterAttribute]);

  // ユーザー監視
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'users'), orderBy('totalWins', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList: UserData[] = [];
      snapshot.forEach((doc) => {
        userList.push({ id: doc.id, ...doc.data() } as UserData);
      });
      setUsers(userList);
    });
    return () => unsubscribe();
  }, [db]);

  // ルーム監視
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomList: Room[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.roomId) data.roomId = doc.id;
        roomList.push(data as Room);
      });
      setRooms(roomList);
    });
    return () => unsubscribe();
  }, [db]);

  // カード監視
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'cards'), orderBy('definitionId', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cardList: FirestoreCardData[] = [];
      snapshot.forEach((doc) => {
        cardList.push({ firestoreId: doc.id, ...doc.data() } as FirestoreCardData);
      });
      setCards(cardList);
    });
    return () => unsubscribe();
  }, [db]);

  // --- User Actions ---
  const handleResetStats = async (userId: string, userName: string) => {
    if (!confirm(`ユーザー「${userName}」の戦績（勝利数・対戦数）をリセットしますか？`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { totalWins: 0, totalMatches: 0 });
      alert('戦績をリセットしました。');
    } catch (e) {
      console.error(e);
      alert('エラーが発生しました。');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    const confirmation = prompt(`警告：ユーザー「${userName}」を完全に削除しようとしています。\n実行するには削除対象のユーザー名を入力してください。`);
    if (confirmation !== userName) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      alert('ユーザーを削除しました。');
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました。');
    }
  };

  // --- Room Actions ---
  const handleForceCloseRoom = async (roomId: string) => {
    if (!confirm(`ルーム「${roomId}」を強制終了しますか？`)) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId), { status: 'finished', winnerId: 'admin_terminated' });
      alert('ルームを終了状態にしました。');
    } catch (e) {
      console.error(e);
      alert('エラーが発生しました。');
    }
  };

  // --- Card Actions ---
  const handleEditCard = (card: FirestoreCardData) => {
    setEditingCard(card);
    setEditFormData({ ...card });
    setIsNewCard(false);
    setShowCardModal(true);
  };

  const handleDeleteCard = async (card: FirestoreCardData) => {
      if (!confirm(`本当にカード「${card.name} (ID: ${card.definitionId})」を削除しますか？\n\n※注意：このカードを既にデッキに入れているユーザーがいる場合、エラーの原因になる可能性があります。`)) return;
      try {
          await deleteDoc(doc(db, 'cards', card.firestoreId));
      } catch(e) {
          console.error(e);
          alert('削除に失敗しました。');
      }
  };

  const handleNewCard = () => {
    const maxId = cards.length > 0 ? Math.max(...cards.map(c => c.definitionId)) : -1;
    const nextId = maxId + 1;
    
    setEditingCard(null);
    setEditFormData({
      definitionId: nextId,
      name: '新規カード',
      attack: 1,
      defense: 1,
      attribute: 'passion',
      description: '',
      image: '1.jpeg',
      effect: 'NONE',
      effectValue: 0,
      level: 1,
      baseDefinitionId: nextId, // Default to self (base form)
      unlocks: undefined,
    });
    setIsNewCard(true);
    setShowCardModal(true);
  };

  const saveCard = async () => {
    if (!db || !editFormData) return;
    
    // Validate
    if (!editFormData.name) { alert('名前を入力してください'); return; }
    
    const saveData = {
        definitionId: Number(editFormData.definitionId),
        name: editFormData.name,
        attack: Number(editFormData.attack),
        defense: Number(editFormData.defense),
        attribute: editFormData.attribute,
        description: editFormData.description || '',
        image: editFormData.image || '1.jpeg',
        effect: editFormData.effect || 'NONE',
        effectValue: Number(editFormData.effectValue || 0),
        level: Number(editFormData.level || 1),
        baseDefinitionId: Number(editFormData.baseDefinitionId),
        unlocks: editFormData.unlocks ? Number(editFormData.unlocks) : null // null for Firestore removal if needed, or omit
    };
    
    // Clean up undefined/null
    if (saveData.unlocks === null) delete (saveData as any).unlocks;

    try {
      if (isNewCard) {
        // 新規作成
        await addDoc(collection(db, 'cards'), saveData);
        alert('カードを追加しました');
      } else if (editingCard) {
        // 更新
        await updateDoc(doc(db, 'cards', editingCard.firestoreId), saveData);
        alert('カードを更新しました');
      }
      setShowCardModal(false);
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました');
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('ja-JP');
  };

  return (
    <div className="w-full h-full bg-gray-900 text-white overflow-hidden flex flex-col relative">
       {/* Header */}
       <div className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center shadow-lg z-10">
         <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-red-500 flex items-center gap-2">
                <span>🛠️</span> Game Master
            </h1>
            <div className="flex space-x-2 bg-gray-900 rounded-lg p-1">
                <button onClick={() => setActiveTab('users')} className={`px-4 py-1 rounded-md transition-colors ${activeTab === 'users' ? 'bg-gray-700 text-white font-bold' : 'text-gray-400 hover:text-white'}`}>ユーザー</button>
                <button onClick={() => setActiveTab('rooms')} className={`px-4 py-1 rounded-md transition-colors ${activeTab === 'rooms' ? 'bg-gray-700 text-white font-bold' : 'text-gray-400 hover:text-white'}`}>ルーム</button>
                <button onClick={() => setActiveTab('cards')} className={`px-4 py-1 rounded-md transition-colors ${activeTab === 'cards' ? 'bg-gray-700 text-white font-bold' : 'text-gray-400 hover:text-white'}`}>カード管理</button>
            </div>
         </div>
         <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm font-bold border border-gray-500">閉じる</button>
       </div>

       {/* Content */}
       <div className="flex-grow overflow-hidden p-6 relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10 pointer-events-none"></div>

          {activeTab === 'users' && (
            <div className="h-full flex flex-col bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl overflow-hidden backdrop-blur-sm">
                <div className="p-4 border-b border-gray-700 bg-gray-900/50">
                    <h2 className="font-bold text-lg text-amber-400">ユーザー ({users.length})</h2>
                </div>
                <div className="flex-grow overflow-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-gray-400 text-sm sticky top-0 z-10">
                            <tr>
                                <th className="p-3">Rank</th>
                                <th className="p-3">Name / ID</th>
                                <th className="p-3">Stats</th>
                                <th className="p-3">Cards</th>
                                <th className="p-3">Created</th>
                                <th className="p-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {users.map((user, idx) => (
                                <tr key={user.id} className="hover:bg-gray-700/50">
                                    <td className="p-3 text-center">{idx + 1}</td>
                                    <td className="p-3">
                                        <div className="font-bold">{user.displayName}</div>
                                        <div className="text-xs text-gray-500 font-mono">{user.id}</div>
                                    </td>
                                    <td className="p-3 text-amber-400 font-bold">{user.totalWins}勝 <span className="text-gray-500 font-normal">/ {user.totalMatches}戦</span></td>
                                    <td className="p-3">{user.unlockedCardIds?.length || 0}</td>
                                    <td className="p-3 text-xs text-gray-400">{formatDate(user.createdAt)}</td>
                                    <td className="p-3 text-center space-x-2">
                                        <button onClick={() => handleResetStats(user.id, user.displayName)} className="text-xs bg-orange-900 text-orange-200 px-2 py-1 rounded">リセット</button>
                                        <button onClick={() => handleDeleteUser(user.id, user.displayName)} className="text-xs bg-red-900 text-red-200 px-2 py-1 rounded">削除</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          )}

          {activeTab === 'rooms' && (
             <div className="h-full flex flex-col bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl overflow-hidden backdrop-blur-sm">
                <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex justify-between">
                    <h2 className="font-bold text-lg text-green-400">ルーム ({rooms.length})</h2>
                    <button onClick={() => window.location.reload()} className="text-xs bg-gray-700 px-2 py-1 rounded">更新</button>
                </div>
                <div className="flex-grow overflow-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-gray-400 text-sm sticky top-0 z-10">
                            <tr>
                                <th className="p-3">ID</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Host / Guest</th>
                                <th className="p-3">Last Active</th>
                                <th className="p-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {rooms.map((room) => (
                                <tr key={room.roomId} className="hover:bg-gray-700/50">
                                    <td className="p-3 font-mono text-xs">{room.roomId}<br/>Rd:{room.round}</td>
                                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${room.status==='playing'?'bg-red-900 text-red-200':room.status==='waiting'?'bg-green-900 text-green-200':'bg-gray-700'}`}>{room.status}</span></td>
                                    <td className="p-3 text-sm">H: {room.hostName}<br/>G: {room.guestName||'-'}</td>
                                    <td className="p-3 text-xs text-gray-400">{formatDate(room.hostLastActive || room.createdAt)}</td>
                                    <td className="p-3 text-center">
                                        {room.status !== 'finished' && (
                                            <button onClick={() => handleForceCloseRoom(room.roomId)} className="text-xs bg-red-600 text-white px-2 py-1 rounded">終了</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          )}

          {activeTab === 'cards' && (
             <div className="h-full flex flex-col bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl overflow-hidden backdrop-blur-sm">
                <div className="p-4 border-b border-gray-700 bg-gray-900/50 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="font-bold text-lg text-blue-400">カード管理 ({cards.length})</h2>
                            <p className="text-xs text-gray-400">定義ID順。画像はファイル名指定。</p>
                        </div>
                        <button onClick={handleNewCard} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded shadow">+ 新規追加</button>
                    </div>
                    
                    {/* Filters */}
                    <div className="flex gap-4 items-center">
                        <input 
                            type="text" 
                            placeholder="名前、ID、説明で検索..." 
                            value={cardSearchTerm}
                            onChange={(e) => setCardSearchTerm(e.target.value)}
                            className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:border-blue-500 outline-none flex-grow"
                        />
                        <select 
                            value={cardFilterAttribute} 
                            onChange={(e) => setCardFilterAttribute(e.target.value as Attribute | 'ALL')}
                            className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:border-blue-500 outline-none w-32"
                        >
                            <option value="ALL">全属性</option>
                            <option value="passion">Passion</option>
                            <option value="calm">Calm</option>
                            <option value="harmony">Harmony</option>
                        </select>
                    </div>
                </div>

                <div className="flex-grow overflow-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-900 text-gray-400 text-sm sticky top-0 z-10">
                            <tr>
                                <th className="p-3 w-12">ID</th>
                                <th className="p-3">Preview</th>
                                <th className="p-3">Details (Name/Attr/Stats)</th>
                                <th className="p-3">Effect</th>
                                <th className="p-3">Evo (Lv/Base/Unlock)</th>
                                <th className="p-3 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {filteredCards.map((card) => (
                                <tr key={card.definitionId} className="hover:bg-gray-700/50">
                                    <td className="p-3 font-mono text-gray-300 font-bold text-center">{card.definitionId}</td>
                                    <td className="p-3">
                                        {/* Added leading slash to src to fix preview path */}
                                        <img src={`/Image2/${card.image}`} alt="" className="w-12 h-16 object-cover rounded border border-gray-600 bg-black" />
                                        <div className="text-[10px] text-gray-500 truncate w-12">{card.image}</div>
                                    </td>
                                    <td className="p-3">
                                        <div className="font-bold text-white">{card.name}</div>
                                        <div className="text-xs flex gap-2 mt-1">
                                            <span className={`px-1.5 rounded border ${card.attribute==='passion'?'border-red-500 text-red-400':card.attribute==='calm'?'border-blue-500 text-blue-400':'border-green-500 text-green-400'}`}>{card.attribute}</span>
                                            <span className="text-gray-300">ATK:{card.attack} / DEF:{card.defense}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400 mt-1 max-w-[150px] truncate">{card.description}</div>
                                    </td>
                                    <td className="p-3 text-xs">
                                        <div className="text-amber-300">{card.effect}</div>
                                        {card.effect !== 'NONE' && <div>Val: {card.effectValue}</div>}
                                    </td>
                                    <td className="p-3 text-xs text-gray-300">
                                        <div>Lv.{card.level || 1}</div>
                                        <div>Base: {card.baseDefinitionId}</div>
                                        {card.unlocks !== undefined && <div className="text-green-400">Unlock: {card.unlocks}</div>}
                                    </td>
                                    <td className="p-3 text-center space-y-1">
                                        <button onClick={() => handleEditCard(card)} className="bg-gray-700 hover:bg-gray-600 border border-gray-500 text-white px-3 py-1 rounded text-sm w-full">編集</button>
                                        <button onClick={() => handleDeleteCard(card)} className="bg-red-900/50 hover:bg-red-800 border border-red-800 text-red-200 px-3 py-1 rounded text-xs w-full">削除</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          )}
       </div>

       {/* Edit/Add Modal */}
       {showCardModal && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">{isNewCard ? '新規カード追加' : `カード編集 (ID: ${editingCard?.definitionId})`}</h3>
                    <button onClick={() => setShowCardModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Definition ID (Read Only)</label>
                            <input type="number" value={editFormData.definitionId} readOnly className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-gray-500 cursor-not-allowed" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Card Name</label>
                            <input type="text" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-amber-500 outline-none" placeholder="カード名" />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Attack</label>
                            <input type="number" value={editFormData.attack} onChange={e => setEditFormData({...editFormData, attack: Number(e.target.value)})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Defense</label>
                            <input type="number" value={editFormData.defense} onChange={e => setEditFormData({...editFormData, defense: Number(e.target.value)})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" />
                        </div>
                         <div>
                            <label className="block text-xs text-gray-400 mb-1">Attribute</label>
                            <select value={editFormData.attribute} onChange={e => setEditFormData({...editFormData, attribute: e.target.value as Attribute})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white">
                                <option value="passion">Passion (赤)</option>
                                <option value="calm">Calm (青)</option>
                                <option value="harmony">Harmony (緑)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Description</label>
                        <textarea value={editFormData.description} onChange={e => setEditFormData({...editFormData, description: e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white h-20" placeholder="フレーバーテキストや効果の説明" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Image Filename (in public/Image2/)</label>
                            <input 
                                type="text" 
                                list="image-options"
                                value={editFormData.image} 
                                onChange={e => setEditFormData({...editFormData, image: e.target.value})} 
                                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" 
                                placeholder="ex: 1.jpeg" 
                            />
                            {/* 画像ファイル名の入力候補 */}
                            <datalist id="image-options">
                                {existingImages.map(img => (
                                    <option key={img} value={img} />
                                ))}
                            </datalist>
                        </div>
                         <div className="flex items-center justify-center bg-black/50 border border-gray-700 rounded mt-5 relative group">
                             {editFormData.image ? (
                                <>
                                 {/* Added leading slash to src to fix preview path */}
                                 <img src={`/Image2/${editFormData.image}`} alt="Preview" className="h-10 object-contain" onError={(e) => (e.currentTarget.style.display='none')} />
                                 <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/80 text-xs text-white p-1 rounded">
                                    Preview
                                 </div>
                                </>
                             ) : <span className="text-xs text-gray-500">No Image</span>}
                         </div>
                    </div>

                    <div className="border-t border-gray-700 pt-4 grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Effect Type</label>
                            <select value={editFormData.effect} onChange={e => setEditFormData({...editFormData, effect: e.target.value as EffectType})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white">
                                <option value="NONE">NONE (効果なし)</option>
                                <option value="DIRECT_DAMAGE">DIRECT_DAMAGE (直接ダメージ)</option>
                                <option value="HEAL_PLAYER">HEAL_PLAYER (回復)</option>
                                <option value="DRAW_CARD">DRAW_CARD (ドロー)</option>
                                <option value="SHIELD">SHIELD (シールド/軽減)</option>
                                <option value="LIFE_DRAIN">LIFE_DRAIN (ドレイン/吸収)</option>
                                <option value="BERSERK">BERSERK (背水の陣/HP10以下で強化)</option>
                                <option value="PIERCING">PIERCING (貫通/防御無視)</option>
                                <option value="REFLECT">REFLECT (反射/カウンター)</option>
                                <option value="RECOIL">RECOIL (捨て身/自傷攻撃)</option>
                            </select>
                        </div>
                         <div>
                            <label className="block text-xs text-gray-400 mb-1">Effect Value</label>
                            <input type="number" value={editFormData.effectValue} onChange={e => setEditFormData({...editFormData, effectValue: Number(e.target.value)})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" />
                        </div>
                    </div>

                    <div className="border-t border-gray-700 pt-4 grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Level (1, 2, 3...)</label>
                            <input type="number" value={editFormData.level} onChange={e => setEditFormData({...editFormData, level: Number(e.target.value)})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Base Definition ID (Evo Origin)</label>
                            <input type="number" value={editFormData.baseDefinitionId} onChange={e => setEditFormData({...editFormData, baseDefinitionId: Number(e.target.value)})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" placeholder="通常は自分と同じID" />
                        </div>
                         <div>
                            <label className="block text-xs text-gray-400 mb-1">Unlocks ID (Next Evo)</label>
                            <input type="number" value={editFormData.unlocks || ''} onChange={e => setEditFormData({...editFormData, unlocks: e.target.value ? Number(e.target.value) : undefined})} className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white" placeholder="空白なら無し" />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-700 bg-gray-900 rounded-b-lg flex justify-end gap-4">
                    <button onClick={() => setShowCardModal(false)} className="px-4 py-2 rounded text-gray-300 hover:text-white">キャンセル</button>
                    <button onClick={saveCard} className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-6 py-2 rounded shadow">保存する</button>
                </div>
            </div>
        </div>
       )}
    </div>
  );
};

export default GameMaster;
