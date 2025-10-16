import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Theme, View, AppData, User, Summary, Flashcard, Question, ChatMessage, Comment, Source, AudioSummary, MindMap, UserMessageVote, UserSourceVote, ContentType, UserContentInteraction, QuestionNotebook, UserNotebookInteraction, UserQuestionAnswer } from '../types';
import { VIEWS, ACHIEVEMENTS } from '../constants';
// Fix: Import Bars3Icon.
import { SunIcon, MoonIcon, PaperAirplaneIcon, UserCircleIcon, ClockIcon, PlusIcon, MinusIcon, PaperClipIcon, GoogleIcon, CloudArrowUpIcon, BookOpenIcon, PencilIcon, FireIcon, TrashIcon, DocumentTextIcon, StarIcon, EyeIcon, FunnelIcon, XMarkIcon, SparklesIcon, LightBulbIcon, ChartBarSquareIcon, Squares2X2Icon, Bars3Icon, QuestionMarkCircleIcon, ShareIcon, SpeakerWaveIcon, CheckCircleIcon, Cog6ToothIcon } from './Icons';
import { getSimpleChatResponse, getPersonalizedStudyPlan, processAndGenerateAllContentFromSource, generateImageForMindMap, filterItemsByPrompt, generateSpecificContent, generateNotebookName, generateMoreContentFromSource, generateContentFromPromptAndSources } from '../services/geminiService';
// Fix: Import addCommentToContent from supabaseClient.
import { addChatMessage, supabase, addSource, addGeneratedContent, addSourceComment, updateSource, deleteSource, upsertUserContentInteraction, incrementContentVote, upsertUserVote, incrementVoteCount, addQuestionNotebook, updateQuestionNotebook, deleteQuestionNotebook, addNotebookComment, upsertUserQuestionAnswer, addCommentToContent, clearNotebookAnswers, updateContentComments, updateUser as supabaseUpdateUser, addAudioSummary, appendGeneratedContentToSource } from '../services/supabaseClient';
import { Modal } from './Modal';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import * as mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://aistudiocdn.com/pdfjs-dist@^4.4.168/build/pdf.worker.mjs`;

interface MainContentProps {
  activeView: View;
  setActiveView: (view: View) => void;
  appData: AppData;
  setAppData: React.Dispatch<React.SetStateAction<AppData>>;
  currentUser: User;
  updateUser: (user: User) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  processingTasks: {id: string, name: string, message: string, status: 'processing' | 'success' | 'error'}[];
  setProcessingTasks: React.Dispatch<React.SetStateAction<{id: string, name: string, message: string, status: 'processing' | 'success' | 'error'}[]>>;
}

const Header: React.FC<{ title: string; theme: Theme; setTheme: (theme: Theme) => void; }> = ({ title, theme, setTheme }) => (
    <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-foreground-light dark:text-foreground-dark">{title}</h1>
        <div className="flex items-center gap-4">
            <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark hover:shadow-md transition-shadow"
            >
                {theme === 'light' ? <MoonIcon className="w-6 h-6" /> : <SunIcon className="w-6 h-6" />}
            </button>
        </div>
    </div>
);

const checkAndAwardAchievements = (user: User, appData: AppData): User => {
    const newAchievements = new Set(user.achievements);
    const interactions = appData.userContentInteractions.filter(i => i.user_id === user.id);
    
    const checkCategory = (category: { count: number; title: string; }[], count: number) => {
        category.forEach(ach => {
            if (count >= ach.count && !newAchievements.has(ach.title)) {
                newAchievements.add(ach.title);
            }
        });
    };

    checkCategory(ACHIEVEMENTS.FLASHCARDS_FLIPPED, interactions.filter(i => i.content_type === 'flashcard' && i.is_read).length);
    checkCategory(ACHIEVEMENTS.QUESTIONS_CORRECT, user.stats.correctAnswers);
    checkCategory(ACHIEVEMENTS.STREAK, user.stats.streak || 0);
    checkCategory(ACHIEVEMENTS.SUMMARIES_READ, interactions.filter(i => i.content_type === 'summary' && i.is_read).length);
    checkCategory(ACHIEVEMENTS.MIND_MAPS_READ, interactions.filter(i => i.content_type === 'mind_map' && i.is_read).length);
    
    if (newAchievements.size > user.achievements.length) {
        return { ...user, achievements: Array.from(newAchievements).sort() };
    }
    return user;
};


export const MainContent: React.FC<MainContentProps> = (props) => {
  const { activeView, setActiveView, appData, setAppData, currentUser, updateUser, theme, setTheme, processingTasks, setProcessingTasks } = props;
  const [chatFilter, setChatFilter] = useState<{viewName: string, term: string} | null>(null);

  const handleChatNavigation = (viewName: string, term: string) => {
    const targetView = VIEWS.find(v => v.name === viewName);
    if (targetView) {
      setChatFilter({ viewName, term });
      setActiveView(targetView);
    }
  };

  const allSummaries = useMemo(() => appData.sources.flatMap(s => (s.summaries || []).map(summary => ({ ...summary, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);
  const allFlashcards = useMemo(() => appData.sources.flatMap(s => (s.flashcards || []).map(fc => ({ ...fc, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);
  const allQuestions = useMemo(() => appData.sources.flatMap(s => (s.questions || []).map(q => ({ ...q, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);
  const allMindMaps = useMemo(() => appData.sources.flatMap(s => (s.mind_maps || []).map(mm => ({ ...mm, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);
  const allAudioSummaries = useMemo(() => appData.sources.flatMap(s => (s.audio_summaries || []).map(as => ({ ...as, source: s, user_id: s.user_id, created_at: s.created_at }))), [appData.sources]);

  const renderContent = () => {
    const currentFilter = chatFilter && chatFilter.viewName === activeView.name ? chatFilter.term : null;
    const clearFilter = () => setChatFilter(null);

    switch (activeView.name) {
      case 'Resumos':
        return <SummariesView allItems={allSummaries} appData={appData} setAppData={setAppData} currentUser={currentUser} updateUser={updateUser} filterTerm={currentFilter} clearFilter={clearFilter} />;
      case 'Flash Cards':
        return <FlashcardsView allItems={allFlashcards} appData={appData} setAppData={setAppData} currentUser={currentUser} updateUser={updateUser} filterTerm={currentFilter} clearFilter={clearFilter} />;
      case 'Questões':
        return <QuestionsView allItems={allQuestions} appData={appData} setAppData={setAppData} currentUser={currentUser} updateUser={updateUser} filterTerm={currentFilter} clearFilter={clearFilter} />;
      case 'Mapas Mentais':
          return <MindMapsView allItems={allMindMaps} appData={appData} setAppData={setAppData} currentUser={currentUser} updateUser={updateUser} />;
      case 'Resumos em Áudio':
          return <AudioSummariesView allItems={allAudioSummaries} appData={appData} setAppData={setAppData} currentUser={currentUser} updateUser={updateUser} />;
      case 'Comunidade':
          return <CommunityView appData={appData} setAppData={setAppData} currentUser={currentUser} onNavigate={handleChatNavigation}/>;
      case 'Perfil':
          return <ProfileView user={currentUser} updateUser={updateUser} appData={appData} setAppData={setAppData} onNavigate={handleChatNavigation} />;
      case 'Admin':
          return <AdminView appData={appData} setAppData={setAppData} />;
      case 'Fontes':
          return <SourcesView appData={appData} setAppData={setAppData} currentUser={currentUser} processingTasks={processingTasks} setProcessingTasks={setProcessingTasks} />;
      default:
        return <div className="text-center mt-10">Selecione uma opção no menu.</div>;
    }
  };

  return (
      <div>
          <Header title={activeView.name} theme={theme} setTheme={setTheme} />
          {renderContent()}
      </div>
  );
};

// =================================================================
// REUSABLE COMPONENTS
// =================================================================

const CommentsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    comments: Comment[];
    onAddComment: (text: string) => void;
    onVoteComment: (commentId: string, voteType: 'hot' | 'cold') => void;
    contentTitle: string;
}> = ({ isOpen, onClose, comments, onAddComment, onVoteComment, contentTitle }) => {
    const [newComment, setNewComment] = useState("");
    const [sortOrder, setSortOrder] = useState<'time' | 'temp'>('temp');

    const handleAdd = () => {
        if (newComment.trim()) {
            onAddComment(newComment.trim());
            setNewComment("");
        }
    };
    
    const sortedComments = useMemo(() => {
        const commentsCopy = [...(comments || [])];
        if (sortOrder === 'time') {
            return commentsCopy.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } else { // 'temp'
            return commentsCopy.sort((a, b) => (b.hot_votes - b.cold_votes) - (a.hot_votes - a.cold_votes));
        }
    }, [comments, sortOrder]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Comentários sobre "${contentTitle}"`}>
            <div className="flex justify-end items-center gap-2 mb-2 border-b border-border-light dark:border-border-dark pb-2">
                 <span className="text-sm font-semibold">Ordenar por:</span>
                 <button onClick={() => setSortOrder('temp')} title="Ordenar por temperatura" className={`p-1 rounded-md ${sortOrder === 'temp' ? 'bg-primary-light/20' : ''}`}><span className="text-xl">🌡️</span></button>
                 <button onClick={() => setSortOrder('time')} title="Ordenar por data" className={`p-1 rounded-md ${sortOrder === 'time' ? 'bg-primary-light/20' : ''}`}><span className="text-xl">🕐</span></button>
            </div>
            <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
                {sortedComments.length > 0 ? sortedComments.map(comment => (
                    <div key={comment.id} className="bg-background-light dark:bg-background-dark p-3 rounded-lg">
                        <p className="font-bold text-sm">{comment.authorPseudonym}</p>
                        <p className="text-sm">{comment.text}</p>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs text-gray-500">{new Date(comment.timestamp).toLocaleString()}</p>
                            <div className="flex items-center gap-3">
                                <button onClick={() => onVoteComment(comment.id, 'hot')} className="flex items-center gap-1 text-gray-500 hover:text-red-500">
                                    <span className="text-base">🔥</span> {comment.hot_votes || 0}
                                </button>
                                <button onClick={() => onVoteComment(comment.id, 'cold')} className="flex items-center gap-1 text-gray-500 hover:text-blue-500">
                                    <span className="text-base">❄️</span> {comment.cold_votes || 0}
                                </button>
                            </div>
                        </div>
                    </div>
                )) : <p className="text-gray-500">Nenhum comentário ainda. Seja o primeiro!</p>}
            </div>
            <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
                <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Adicione seu comentário..."
                    className="w-full h-20 p-2 border rounded-md bg-background-light dark:bg-background-dark border-border-light dark:border-border-dark"
                />
                <button onClick={handleAdd} className="mt-2 w-full bg-primary-light text-white py-2 rounded-md hover:bg-indigo-600">
                    Enviar Comentário
                </button>
            </div>
        </Modal>
    );
};

type SortOption = 'temp' | 'time' | 'subject' | 'user' | 'source';
type FilterStatus = 'all' | 'read' | 'unread';

const ContentToolbar: React.FC<{
    sort: SortOption, setSort: (s: SortOption) => void,
    filter?: FilterStatus, setFilter?: (f: FilterStatus) => void,
    favoritesOnly?: boolean, setFavoritesOnly?: (b: boolean) => void,
    onAiFilter?: (prompt: string) => void,
    onGenerate?: (prompt: string) => void,
    isFiltering?: boolean,
    onClearFilter?: () => void,
}> = ({ sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly, onAiFilter, onGenerate, isFiltering, onClearFilter }) => {
    const [prompt, setPrompt] = useState('');
    
    return (
        <div className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark mb-6 space-y-4">
            {onAiFilter && (
                 <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex-grow w-full relative">
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={onGenerate ? "Filtrar por relevância com IA ou gerar novo conteúdo..." : "Filtrar por relevância com IA..."}
                            className="w-full p-2 pl-4 pr-32 rounded-md bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark"
                        />
                        <div className="absolute right-1 top-1 flex gap-1">
                        <button onClick={() => onAiFilter(prompt)} className="px-3 py-1 bg-secondary-light text-white text-sm rounded-md hover:bg-emerald-600 disabled:opacity-50" disabled={!prompt}>Filtrar</button>
                        {onGenerate && <button onClick={() => { onGenerate(prompt); }} className="px-3 py-1 bg-primary-light text-white text-sm rounded-md hover:bg-indigo-600 disabled:opacity-50" disabled={!prompt}>Gerar</button>}
                        </div>
                    </div>
                    {isFiltering && onClearFilter && (
                        <button onClick={onClearFilter} className="flex items-center gap-2 text-red-500 font-semibold text-sm">
                            <XMarkIcon className="w-4 h-4" /> Limpar Filtro
                        </button>
                    )}
                </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-4">
                    <span className="font-semibold">Ordenar por:</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setSort('temp')} title="Temperatura" className={`p-2 rounded-full ${sort === 'temp' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>🌡️</button>
                        <button onClick={() => setSort('time')} title="Data" className={`p-2 rounded-full ${sort === 'time' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>🕐</button>
                        <button onClick={() => setSort('subject')} title="Matéria" className={`p-2 rounded-full ${sort === 'subject' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>📚</button>
                        <button onClick={() => setSort('user')} title="Usuário" className={`p-2 rounded-full ${sort === 'user' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>👤</button>
                        <button onClick={() => setSort('source')} title="Fonte" className={`p-2 rounded-full ${sort === 'source' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>📄</button>
                    </div>
                </div>
                {filter !== undefined && setFilter && favoritesOnly !== undefined && setFavoritesOnly && (
                    <div className="flex items-center gap-4">
                        <div>
                            <span className="font-semibold mr-2">Mostrar:</span>
                            <select value={filter} onChange={e => setFilter(e.target.value as FilterStatus)} className="p-1 rounded-md bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark">
                                <option value="all">Todos</option>
                                <option value="read">Lidos</option>
                                <option value="unread">Não lidos</option>
                            </select>
                        </div>
                        <button onClick={() => setFavoritesOnly(!favoritesOnly)} className={`flex items-center gap-1 p-2 rounded-md ${favoritesOnly ? 'bg-yellow-400/20 text-yellow-600' : ''}`}>
                            <StarIcon filled={favoritesOnly} className="w-5 h-5" /> Favoritos
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const ContentActions: React.FC<{
    item: { id: string, comments: Comment[], hot_votes: number, cold_votes: number },
    contentType: ContentType | 'question_notebook' | 'question',
    currentUser: User,
    interactions: UserContentInteraction[] | UserNotebookInteraction[],
    onVote: (contentId: string, type: 'hot' | 'cold', increment: 1 | -1) => void,
    onToggleRead: (contentId: string, currentState: boolean) => void,
    onToggleFavorite: (contentId: string, currentState: boolean) => void,
    onComment: () => void,
    extraActions?: React.ReactNode,
}> = ({ item, contentType, currentUser, interactions, onVote, onToggleRead, onToggleFavorite, onComment, extraActions }) => {
    const [activeVote, setActiveVote] = useState<'hot' | 'cold' | null>(null);
    const votePopupRef = useRef<HTMLDivElement>(null);
    
    // Type guard for interactions
    const isContentInteraction = (i: any): i is UserContentInteraction => 'content_type' in i;

    const interaction = interactions.find(i => {
        if (contentType === 'question' || isContentInteraction(i)) {
            return (i as UserContentInteraction).content_id === item.id;
        }
        return (i as UserNotebookInteraction).notebook_id === item.id;
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (votePopupRef.current && !votePopupRef.current.contains(event.target as Node)) {
                setActiveVote(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border-light dark:border-border-dark text-sm">
            <div className="flex items-center gap-3 relative">
                 <button onClick={() => setActiveVote('hot')} className="flex items-center gap-1 text-gray-500 hover:text-red-500">
                    <span className="text-lg">🔥</span> {item.hot_votes || 0}
                </button>
                <button onClick={() => setActiveVote('cold')} className="flex items-center gap-1 text-gray-500 hover:text-blue-500">
                    <span className="text-lg">❄️</span> {item.cold_votes || 0}
                </button>
                 {activeVote && (
                     <div ref={votePopupRef} className="absolute -top-12 -left-2 z-10 bg-black/70 backdrop-blur-sm text-white rounded-full flex items-center p-1 gap-1 shadow-lg">
                        <button onClick={() => onVote(item.id, activeVote, 1)} className="p-1 hover:bg-white/20 rounded-full"><PlusIcon className="w-4 h-4" /></button>
                        <span className="text-sm font-bold w-4 text-center">{activeVote === 'hot' ? interaction?.hot_votes || 0 : interaction?.cold_votes || 0}</span>
                        <button onClick={() => onVote(item.id, activeVote, -1)} className="p-1 hover:bg-white/20 rounded-full"><MinusIcon className="w-4 h-4" /></button>
                    </div>
                 )}
            </div>
            <div className="flex-grow" />
            <button onClick={onComment} className="text-gray-500 hover:text-primary-light">Comentários ({item.comments?.length || 0})</button>
            {extraActions}
             <button onClick={() => onToggleRead(item.id, !!interaction?.is_read)} title={interaction?.is_read ? "Marcar como não lido" : "Marcar como lido"}>
                <EyeIcon className={`w-5 h-5 ${interaction?.is_read ? 'text-green-500' : 'text-gray-400'}`} />
            </button>
            <button onClick={() => onToggleFavorite(item.id, !!interaction?.is_favorite)} title={interaction?.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                <StarIcon filled={!!interaction?.is_favorite} className={`w-5 h-5 ${interaction?.is_favorite ? 'text-yellow-500' : 'text-gray-400'}`} />
            </button>
        </div>
    );
};

const GenerateContentModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    sources: Source[],
    onGenerate: (selectedSourceIds: string[], prompt: string) => void,
    prompt: string,
    contentType: 'summaries' | 'flashcards' | 'questions',
    isLoading: boolean
}> = ({ isOpen, onClose, sources, onGenerate, prompt, contentType, isLoading }) => {
    const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

    const handleToggleSource = (sourceId: string) => {
        setSelectedSources(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sourceId)) {
                newSet.delete(sourceId);
            } else {
                newSet.add(sourceId);
            }
            return newSet;
        });
    };

    const handleGenerate = () => {
        if (selectedSources.size > 0) {
            onGenerate(Array.from(selectedSources), prompt);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Gerar ${contentType} com IA`}>
            <p className="text-sm mb-4">A IA usará o conteúdo das fontes selecionadas como base para gerar novos materiais sobre: <strong className="text-primary-light dark:text-primary-dark">"{prompt}"</strong></p>
            <div className="space-y-2 max-h-60 overflow-y-auto border-y border-border-light dark:border-border-dark py-2 my-2">
                <h3 className="font-semibold">Selecione as fontes de contexto:</h3>
                {sources.map(source => (
                    <div key={source.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-background-light dark:hover:bg-background-dark">
                        <input
                            type="checkbox"
                            id={`source-${source.id}`}
                            checked={selectedSources.has(source.id)}
                            onChange={() => handleToggleSource(source.id)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-light focus:ring-primary-light"
                        />
                        <label htmlFor={`source-${source.id}`} className="flex-grow cursor-pointer">
                            <span className="font-medium">{source.title}</span>
                            <span className="text-xs text-gray-500 ml-2">({source.materia})</span>
                        </label>
                    </div>
                ))}
            </div>
            <button
                onClick={handleGenerate}
                disabled={selectedSources.size === 0 || isLoading}
                className="mt-4 w-full bg-primary-light text-white font-bold py-2 px-4 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-10"
            >
                {isLoading ? (
                    <div className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span>Gerando...</span>
                    </div>
                ) : (
                    <> <SparklesIcon className="w-5 h-5 mr-2" /> Gerar Conteúdo </>
                )}
            </button>
        </Modal>
    );
};

// Fix: Define CreateNotebookModal to resolve 'Cannot find name' error.
const CreateNotebookModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    appData: AppData;
    setAppData: React.Dispatch<React.SetStateAction<AppData>>;
    currentUser: User;
}> = ({ isOpen, onClose, appData, setAppData, currentUser }) => {
    const [name, setName] = useState("");
    const [questionCount, setQuestionCount] = useState(40);
    const [prompt, setPrompt] = useState("");
    const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
    const [excludeAnswered, setExcludeAnswered] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");

    const handleToggleSource = (id: string) => {
        setSelectedSourceIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleCreate = async () => {
        setIsLoading(true);
        setStatusMessage("Coletando questões...");
        try {
            // 1. Get questions from selected sources (or all)
            const sourcesToUse = selectedSourceIds.size > 0
                ? appData.sources.filter(s => selectedSourceIds.has(s.id))
                : appData.sources;
            
            let questionsPool = sourcesToUse.flatMap(s => s.questions);

            // 2. Filter out answered questions if checked
            if (excludeAnswered) {
                const answeredQuestionIds = new Set(appData.userQuestionAnswers.filter(a => a.user_id === currentUser.id).map(a => a.question_id));
                questionsPool = questionsPool.filter(q => !answeredQuestionIds.has(q.id));
            }

            if (questionsPool.length === 0) {
                throw new Error("Nenhuma questão disponível com os filtros aplicados.");
            }

            // 3. Filter by AI prompt if provided
            let finalQuestionIds: string[];
            if (prompt.trim()) {
                setStatusMessage("Filtrando questões com IA...");
                const itemsToFilter = questionsPool.map(q => ({ id: q.id, text: q.questionText }));
                const relevantIds = await filterItemsByPrompt(prompt, itemsToFilter);
                finalQuestionIds = relevantIds.length > 0 ? relevantIds : questionsPool.map(q => q.id); // Fallback to all if AI returns none
            } else {
                finalQuestionIds = questionsPool.map(q => q.id);
            }

            // 4. Shuffle and slice
            const shuffled = finalQuestionIds.sort(() => 0.5 - Math.random());
            const sliced = shuffled.slice(0, questionCount);

            // 5. Generate name if blank
            let finalName = name.trim();
            if (!finalName) {
                setStatusMessage("Gerando nome com IA...");
                const selectedQuestions = appData.sources.flatMap(s => s.questions).filter(q => sliced.includes(q.id));
                finalName = await generateNotebookName(selectedQuestions);
            }

            // 6. Create notebook
            setStatusMessage("Salvando caderno...");
            const payload: Partial<QuestionNotebook> = {
                user_id: currentUser.id, name: finalName, question_ids: sliced, comments: [], hot_votes: 0, cold_votes: 0,
            };
            const newNotebook = await addQuestionNotebook(payload);
            if (newNotebook) {
                setAppData(prev => ({ ...prev, questionNotebooks: [newNotebook, ...prev.questionNotebooks] }));
                onClose();
            } else {
                throw new Error("Falha ao salvar o caderno no banco de dados.");
            }
        } catch (error: any) {
            alert(`Erro: ${error.message}`);
        } finally {
            setIsLoading(false);
            setStatusMessage("");
        }
    };
    
    useEffect(() => {
        if (!isOpen) {
            setName("");
            setQuestionCount(40);
            setPrompt("");
            setSelectedSourceIds(new Set());
            setExcludeAnswered(false);
            setIsLoading(false);
            setStatusMessage("");
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Criar Novo Caderno de Questões">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Nome (opcional)</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="A IA gera um se deixado em branco"
                        className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Quantidade de Questões</label>
                    <input type="number" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Prompt para IA (opcional)</label>
                    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ex: 'Foco em política monetária e COPOM'"
                        className="w-full h-20 p-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-md" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Fontes (opcional, todas por padrão)</label>
                    <div className="max-h-40 overflow-y-auto border border-border-light dark:border-border-dark rounded-md p-2 space-y-1">
                       {appData.sources.map(source => (
                            <div key={source.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                                <input type="checkbox" id={`source-select-${source.id}`} checked={selectedSourceIds.has(source.id)} onChange={() => handleToggleSource(source.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary-light focus:ring-primary-light" />
                                <label htmlFor={`source-select-${source.id}`} className="text-sm cursor-pointer flex-grow truncate flex justify-between items-center">
                                    <span>{source.title}</span>
                                    <span className="text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">Questões: {source.questions.length}</span>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input type="checkbox" id="exclude-answered" checked={excludeAnswered} onChange={e => setExcludeAnswered(e.target.checked)} 
                        className="h-4 w-4 rounded border-gray-300 text-primary-light focus:ring-primary-light" />
                    <label htmlFor="exclude-answered" className="text-sm cursor-pointer">Não incluir questões já respondidas</label>
                </div>
                <button onClick={handleCreate} disabled={isLoading} className="mt-4 w-full bg-primary-light text-white font-bold py-2 px-4 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-10">
                    {isLoading ? (
                         <div className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <span>{statusMessage}</span>
                        </div>
                    ) : 'Criar Caderno'}
                </button>
            </div>
        </Modal>
    );
};

const QuestionStatsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    question: Question;
    appData: AppData;
}> = ({ isOpen, onClose, question, appData }) => {
    const stats = useMemo(() => {
        if (!question) return null;

        const allAnswersForThisQuestion = appData.userQuestionAnswers.filter(
            ans => ans.question_id === question.id
        );

        const firstTryAnswers = allAnswersForThisQuestion.map(ans => ans.attempts[0]);
        const totalFirstTries = firstTryAnswers.length;
        if (totalFirstTries === 0) {
            return { total: 0, correct: 0, incorrect: 0, distribution: question.options.map(o => ({ option: o, count: 0, percentage: 0})) };
        }

        const correctFirstTries = allAnswersForThisQuestion.filter(ans => ans.is_correct_first_try).length;
        const incorrectFirstTries = totalFirstTries - correctFirstTries;

        const distribution = question.options.map(option => {
            const count = firstTryAnswers.filter(ans => ans === option).length;
            return { option, count, percentage: (count / totalFirstTries) * 100 };
        });

        return {
            total: totalFirstTries,
            correct: correctFirstTries,
            incorrect: incorrectFirstTries,
            distribution: distribution.sort((a,b) => b.count - a.count)
        };
    }, [question, appData.userQuestionAnswers]);

    if (!stats) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Estatísticas da Questão`}>
            <div className="space-y-4">
                <p className="text-sm font-semibold truncate">{question.questionText}</p>
                 {stats.total > 0 ? (
                    <>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="bg-background-light dark:bg-background-dark p-3 rounded-lg">
                                <p className="font-semibold text-gray-500">Respostas</p>
                                <p className="text-2xl font-bold">{stats.total}</p>
                            </div>
                             <div className="bg-green-100 dark:bg-green-900/50 p-3 rounded-lg">
                                <p className="font-semibold text-green-700 dark:text-green-300">Acertos</p>
                                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.correct}</p>
                            </div>
                             <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-lg">
                                <p className="font-semibold text-red-700 dark:text-red-300">Erros</p>
                                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.incorrect}</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-2">Distribuição das Respostas (1ª Tentativa)</h4>
                            <div className="space-y-2">
                                {stats.distribution.map(({ option, count, percentage }) => (
                                    <div key={option}>
                                        <div className="flex justify-between items-center text-sm mb-1">
                                            <span className={`truncate ${option === question.correctAnswer ? 'font-bold' : ''}`} title={option}>{option}</span>
                                            <span>{count} ({percentage.toFixed(0)}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                            <div className={`h-2.5 rounded-full ${option === question.correctAnswer ? 'bg-green-500' : 'bg-primary-light'}`} style={{ width: `${percentage}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <p className="text-center text-gray-500 py-4">Nenhum usuário respondeu a esta questão ainda.</p>
                )}
            </div>
        </Modal>
    );
};

const NotebookStatsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    notebook: QuestionNotebook | 'all';
    appData: AppData;
    currentUser: User;
    onClearAnswers: () => void;
}> = ({ isOpen, onClose, notebook, appData, currentUser, onClearAnswers }) => {
    const notebookId = notebook === 'all' ? 'all_questions' : notebook.id;
    const notebookName = notebook === 'all' ? "Todas as Questões" : notebook.name;
    const questionIds = useMemo(() => {
        if (notebook === 'all') {
            return new Set(appData.sources.flatMap(s => s.questions.map(q => q.id)));
        }
        return new Set(notebook.question_ids);
    }, [notebook, appData.sources]);

    const relevantAnswers = useMemo(() => {
        return appData.userQuestionAnswers.filter(
            ans => ans.user_id === currentUser.id && ans.notebook_id === notebookId
        );
    }, [appData.userQuestionAnswers, currentUser.id, notebookId]);

    const leaderboardData = useMemo(() => {
        const userScores: { [userId: string]: { correct: number, total: number } } = {};

        appData.userQuestionAnswers
            .filter(ans => ans.notebook_id === notebookId)
            .forEach(ans => {
                if (!userScores[ans.user_id]) {
                    userScores[ans.user_id] = { correct: 0, total: 0 };
                }
                userScores[ans.user_id].total++;
                if (ans.is_correct_first_try) {
                    userScores[ans.user_id].correct++;
                }
            });

        return Object.entries(userScores)
            .map(([userId, scores]) => {
                const user = appData.users.find(u => u.id === userId);
                return {
                    userId,
                    pseudonym: user?.pseudonym || 'Desconhecido',
                    score: scores.correct,
                };
            })
            .sort((a, b) => b.score - a.score);
    }, [appData.userQuestionAnswers, appData.users, notebookId]);

    const totalQuestions = questionIds.size;
    const questionsAnswered = relevantAnswers.length;
    const correctFirstTry = relevantAnswers.filter(a => a.is_correct_first_try).length;
    const accuracy = questionsAnswered > 0 ? (correctFirstTry / questionsAnswered) * 100 : 0;
    const progress = totalQuestions > 0 ? (questionsAnswered / totalQuestions) * 100 : 0;
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Estatísticas: ${notebookName}`}>
            <div className="space-y-4 p-2">
                <div>
                    <h3 className="text-lg font-semibold mb-2">Seu Progresso</h3>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div className="bg-primary-light h-4 rounded-full text-white text-xs flex items-center justify-center" style={{ width: `${progress}%` }}>
                            {progress.toFixed(0)}%
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 text-right mt-1">{questionsAnswered} de {totalQuestions} questões respondidas</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background-light dark:bg-background-dark p-4 rounded-lg text-center">
                        <p className="text-lg font-semibold">Acertos na 1ª Tentativa</p>
                        <p className="text-3xl font-bold text-green-500">{correctFirstTry}</p>
                    </div>
                    <div className="bg-background-light dark:bg-background-dark p-4 rounded-lg text-center">
                        <p className="text-lg font-semibold">Aproveitamento</p>
                        <p className="text-3xl font-bold text-secondary-light dark:text-secondary-dark">{accuracy.toFixed(1)}%</p>
                    </div>
                </div>

                <div className="pt-4 border-t border-border-light dark:border-border-dark">
                     <h3 className="text-lg font-semibold mb-2">Leaderboard do Caderno</h3>
                     <div className="max-h-40 overflow-y-auto space-y-2">
                        {leaderboardData.length > 0 ? leaderboardData.map((entry, index) => (
                            <div key={entry.userId} className={`flex items-center justify-between p-2 rounded-md ${entry.userId === currentUser.id ? 'bg-primary-light/10' : 'bg-background-light dark:bg-background-dark'}`}>
                                <p><span className="font-bold w-6 inline-block">{index + 1}.</span> {entry.pseudonym}</p>
                                <p className="font-bold">{entry.score} acertos</p>
                            </div>
                        )) : <p className="text-sm text-gray-500">Ninguém respondeu a este caderno ainda.</p>}
                     </div>
                </div>

                <div className="pt-4 border-t border-border-light dark:border-border-dark">
                    <button 
                        onClick={onClearAnswers}
                        className="w-full bg-red-600 text-white font-bold py-2 px-4 rounded-md hover:bg-red-700 transition flex items-center justify-center gap-2"
                    >
                       <TrashIcon className="w-5 h-5"/> Limpar Respostas e Recomeçar
                    </button>
                </div>
            </div>
        </Modal>
    );
};


// =================================================================
// CONTENT VIEWS
// =================================================================

const useContentViewController = (allItems: any[], currentUser: User, appData: AppData, contentType: ContentType) => {
    const [sort, setSort] = useState<SortOption>('temp');
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [aiFilterIds, setAiFilterIds] = useState<string[] | null>(null);
    const [isFiltering, setIsFiltering] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateModalOpen, setGenerateModalOpen] = useState(false);
    const [generationPrompt, setGenerationPrompt] = useState("");

    const processedItems = useMemo(() => {
        let items = [...allItems];
        
        // 1. AI Filter
        if (aiFilterIds) {
            const idSet = new Set(aiFilterIds);
            items = items.filter(item => idSet.has(item.id));
        }

        // 2. Favorite Filter
        if (favoritesOnly) {
            items = items.filter(item => {
                const interaction = appData.userContentInteractions.find(i => i.user_id === currentUser.id && i.content_id === item.id && i.content_type === contentType);
                return interaction?.is_favorite;
            });
        }
        
        // 3. Read/Unread Filter
        if (filter !== 'all') {
            items = items.filter(item => {
                const interaction = appData.userContentInteractions.find(i => i.user_id === currentUser.id && i.content_id === item.id && i.content_type === contentType);
                const isRead = interaction?.is_read || false;
                return filter === 'read' ? isRead : !isRead;
            });
        }

        // 4. Sorting
        switch (sort) {
            case 'time':
                items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                break;
            case 'temp':
                items.sort((a, b) => (b.hot_votes - b.cold_votes) - (a.hot_votes - a.cold_votes));
                break;
        }
        
        // 5. Grouping (if applicable)
        if (sort === 'subject' || sort === 'user' || sort === 'source') {
            const grouped = items.reduce((acc, item) => {
                let groupKey: string;
                if (sort === 'subject') {
                    groupKey = item.source?.materia || 'Outros';
                } else if (sort === 'user') {
                    groupKey = item.user_id || 'Desconhecido';
                } else { // source
                    groupKey = item.source?.title || 'Fonte Desconhecida';
                }
                if (!acc[groupKey]) acc[groupKey] = [];
                acc[groupKey].push(item);
                return acc;
            }, {} as Record<string, any[]>);
            // Sort items within each group by temperature
            // Fix: Add type annotation for groupItems to avoid type inference issues.
            Object.values(grouped).forEach((groupItems: any[]) => {
                groupItems.sort((a, b) => (b.hot_votes - b.cold_votes) - (a.hot_votes - a.cold_votes));
            });
            return grouped;
        }

        return items;
    }, [allItems, sort, filter, favoritesOnly, aiFilterIds, appData.userContentInteractions, currentUser.id, contentType]);
    
    const handleAiFilter = async (prompt: string) => {
        if (!prompt) return;
        setIsFiltering(true);
        const itemsToFilter = allItems.map(item => {
            let text = '';
            if (contentType === 'summary') text = item.title + " " + item.content;
            if (contentType === 'flashcard') text = item.front + " " + item.back;
            if (contentType === 'question') text = item.questionText + " " + item.options.join(' ');
            if (contentType === 'mind_map') text = item.title;
            if (contentType === 'audio_summary') text = item.title;
            return { id: item.id, text };
        });
        const relevantIds = await filterItemsByPrompt(prompt, itemsToFilter);
        setAiFilterIds(relevantIds);
        setIsFiltering(false);
    };
    
    const handleClearFilter = () => setAiFilterIds(null);

    const handleOpenGenerateModal = (prompt: string) => {
        setGenerationPrompt(prompt);
        setGenerateModalOpen(true);
    };
    
    return {
        sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly,
        aiFilterIds, setAiFilterIds, isFiltering, setIsFiltering,
        isGenerating, setIsGenerating, generateModalOpen, setGenerateModalOpen,
        generationPrompt,
        processedItems, handleAiFilter, handleClearFilter, handleOpenGenerateModal
    };
};

const handleInteractionUpdate = async (
    setAppData: React.Dispatch<React.SetStateAction<AppData>>,
    appData: AppData,
    currentUser: User,
    updateUser: (user: User) => void,
    contentType: ContentType,
    contentId: string,
    update: Partial<UserContentInteraction>
) => {
    const existingInteraction = appData.userContentInteractions.find(
      i => i.user_id === currentUser.id && i.content_id === contentId && i.content_type === contentType
    );
    const wasRead = existingInteraction?.is_read || false;

    let xpGained = 0;
    // Grant XP if a flashcard is being marked as read (flipped) for the first time
    if (contentType === 'flashcard' && update.is_read && !wasRead) {
        xpGained += 1;
    }

    // Optimistic UI update
    let newInteractions = [...appData.userContentInteractions];
    const existingIndex = newInteractions.findIndex(i => i.id === existingInteraction?.id);
    if (existingIndex > -1) {
        newInteractions[existingIndex] = { ...newInteractions[existingIndex], ...update };
    } else {
        newInteractions.push({ id: `temp-${Date.now()}`, user_id: currentUser.id, content_id: contentId, content_type: contentType, is_read: false, is_favorite: false, hot_votes: 0, cold_votes: 0, ...update });
    }
    const tempAppData = { ...appData, userContentInteractions: newInteractions };
    setAppData(tempAppData);

    // Update DB
    const result = await upsertUserContentInteraction({
        user_id: currentUser.id,
        content_id: contentId,
        content_type: contentType,
        ...update
    });
    
    if (!result) {
        console.error("Failed to update interaction on the server.");
        // Revert state on failure
        setAppData(appData);
        return;
    }

    const userWithNewXp = { ...currentUser, xp: currentUser.xp + xpGained };
    const userWithNewAchievements = checkAndAwardAchievements(userWithNewXp, tempAppData);

    if (userWithNewAchievements.xp !== currentUser.xp || userWithNewAchievements.achievements.length !== currentUser.achievements.length) {
        updateUser(userWithNewAchievements);
    }
};

const handleVoteUpdate = async (
    setAppData: React.Dispatch<React.SetStateAction<AppData>>,
    currentUser: User,
    updateUser: (user: User) => void,
    appData: AppData,
    // Fix: Narrow contentType to only include types with votable content tables.
    contentType: 'summary' | 'flashcard' | 'question' | 'mind_map' | 'audio_summary',
    contentId: string,
    type: 'hot' | 'cold',
    increment: 1 | -1
) => {
    const tableMap = { summary: 'summaries', flashcard: 'flashcards', question: 'questions', mind_map: 'mind_maps', audio_summary: 'audio_summaries' };
    const tableName = tableMap[contentType];
    
    const interaction = appData.userContentInteractions.find(i => i.user_id === currentUser.id && i.content_id === contentId && i.content_type === contentType);
    const currentVoteCount = (type === 'hot' ? interaction?.hot_votes : interaction?.cold_votes) || 0;
    
    if (increment === -1 && currentVoteCount <= 0) return; // Can't go below 0

    const voteUpdate: Partial<UserContentInteraction> = {
        [`${type}_votes`]: currentVoteCount + increment
    };
    
    handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, contentId, voteUpdate);
    
    // Update main content vote count optimistically
    setAppData(prev => {
        const newSources = prev.sources.map(source => {
            const newContentList = (source[tableName as keyof Source] as any[] || []).map(item => {
                if (item.id === contentId) {
                    return { ...item, [`${type}_votes`]: item[`${type}_votes`] + increment };
                }
                return item;
            });
            return { ...source, [tableName]: newContentList };
        });
        return { ...prev, sources: newSources };
    });
    
    await incrementContentVote(contentType, contentId, `${type}_votes`, increment);
    
    // Grant/deduct XP from the content creator
    const sourceContainingItem = appData.sources.find(s => 
        (s[tableName as keyof Source] as any[])?.some(item => item.id === contentId)
    );

    if (sourceContainingItem) {
        const authorId = sourceContainingItem.user_id;
        // Don't award XP for voting on your own content
        if (authorId !== currentUser.id) {
            const author = appData.users.find(u => u.id === authorId);
            if (author) {
                const xpChange = (type === 'hot' ? 1 : -1) * increment;
                const updatedAuthor = { ...author, xp: author.xp + xpChange };
                
                const result = await supabaseUpdateUser(updatedAuthor);
                
                if (result) {
                    setAppData(prev => ({
                        ...prev,
                        users: prev.users.map(u => u.id === result.id ? result : u),
                    }));
                }
            }
        }
    }
};

const handleGenerateNewContent = async (
    setAppData: React.Dispatch<React.SetStateAction<AppData>>,
    appData: AppData,
    setIsGenerating: (b: boolean) => void,
    onClose: () => void,
    contentType: 'summaries' | 'flashcards' | 'questions',
    selectedSourceIds: string[],
    prompt: string
) => {
    setIsGenerating(true);
    const contextSources = appData.sources.filter(s => selectedSourceIds.includes(s.id));
    
    if (contextSources.length === 0) {
        alert("Nenhuma fonte selecionada.");
        setIsGenerating(false);
        return;
    }
    
    const firstSource = contextSources[0];
    
    try {
        const contextText = contextSources.map(s => `Fonte: ${s.title}\n${s.summary}`).join('\n\n---\n\n');
        
        const newContent = await generateSpecificContent(contentType, contextText, prompt);

        if (newContent.error) {
            throw new Error(newContent.error);
        }

        const createdContent = await addGeneratedContent(firstSource.id, { [contentType]: newContent });

        if (!createdContent) {
            throw new Error("Falha ao salvar o conteúdo gerado.");
        }

        // UI Update with real data
        setAppData(prev => {
            const newSources = [...prev.sources];
            const sourceIndex = newSources.findIndex(s => s.id === firstSource.id);
            if (sourceIndex > -1) {
                const newlyAddedItems = createdContent[contentType as keyof typeof createdContent];
                const updatedSource = {
                    ...newSources[sourceIndex],
                    [contentType]: [
                        ...(newSources[sourceIndex][contentType as keyof Source] as any[] || []),
                        ...newlyAddedItems
                    ]
                };
                newSources[sourceIndex] = updatedSource;
            }
            return { ...prev, sources: newSources };
        });

    } catch (error: any) {
        alert(`Erro ao gerar conteúdo: ${error.message}`);
    } finally {
        setIsGenerating(false);
        onClose();
    }
};

const renderSummaryWithTooltips = (summary: Summary) => {
    let content: (string | React.ReactElement)[] = [(summary.content || "")];
    
    // Replace markdown-like bolding with <strong> tags
    const processMarkdown = (part: string | React.ReactElement) => {
        if (typeof part !== 'string') return [part];
        const elements: (string | React.ReactElement)[] = [];
        const parts = part.split(/(\*\*.*?\*\*)/g);
        parts.forEach((p, i) => {
            if (p.startsWith('**') && p.endsWith('**')) {
                elements.push(<strong key={`strong-${i}`}>{p.slice(2, -2)}</strong>);
            } else {
                elements.push(p);
            }
        });
        return elements;
    };

    content = content.flatMap(processMarkdown);

    for (const keyPoint of (summary.keyPoints || [])) {
        if (!keyPoint.term) continue;
        let newContent: (string | React.ReactElement)[] = [];
        const regex = new RegExp(`\\b(${keyPoint.term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})\\b`, 'gi');
        
        for (const part of content) {
            if (typeof part === 'string') {
                const stringParts = part.split(regex);
                for (let i = 0; i < stringParts.length; i++) {
                    if (i % 2 === 1) { // It's the term
                        newContent.push(
                            <span key={`${keyPoint.term}-${i}`} className="relative group font-bold text-primary-light dark:text-primary-dark cursor-pointer underline decoration-dotted">
                                {stringParts[i]}
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-2 bg-gray-800 text-white text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
                                    {keyPoint.description}
                                </span>
                            </span>
                        );
                    } else {
                        newContent.push(stringParts[i]);
                    }
                }
            } else {
                newContent.push(part);
            }
        }
        content = newContent;
    }
    return <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{content}</div>;
}


const SummariesView: React.FC<{ allItems: (Summary & { user_id: string, created_at: string})[]; appData: AppData; setAppData: React.Dispatch<React.SetStateAction<AppData>>; currentUser: User; updateUser: (user: User) => void; filterTerm: string | null; clearFilter: () => void; }> = ({ allItems, appData, setAppData, currentUser, updateUser, filterTerm, clearFilter }) => {
    const [expanded, setExpanded] = useState<string | null>(null);
    const [commentingOn, setCommentingOn] = useState<Summary | null>(null);
    const contentType: ContentType = 'summary';

    useEffect(() => {
        if (filterTerm) {
            const foundItem = allItems.find(item => item.title.toLowerCase().includes(filterTerm.toLowerCase()));
            if (foundItem) {
                setExpanded(foundItem.id);
                 // Scroll to item
                setTimeout(() => {
                    const element = document.getElementById(`summary-${foundItem.id}`);
                    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
            clearFilter();
        }
    }, [filterTerm, clearFilter, allItems]);

    const {
        sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly,
        aiFilterIds, isFiltering, isGenerating, setIsGenerating,
        generateModalOpen, setGenerateModalOpen, generationPrompt,
        processedItems, handleAiFilter, handleClearFilter, handleOpenGenerateModal
    } = useContentViewController(allItems, currentUser, appData, contentType);

    const handleCommentAction = async (action: 'add' | 'vote', payload: any) => {
        if (!commentingOn) return;
        let updatedComments = [...commentingOn.comments];
        if (action === 'add') {
            const newComment: Comment = { id: `c_${Date.now()}`, authorId: currentUser.id, authorPseudonym: currentUser.pseudonym, text: payload.text, timestamp: new Date().toISOString(), hot_votes: 0, cold_votes: 0 };
            updatedComments.push(newComment);
        } else if (action === 'vote') {
             const commentIndex = updatedComments.findIndex(c => c.id === payload.commentId);
            if (commentIndex > -1) {
                updatedComments[commentIndex].hot_votes += payload.voteType === 'hot' ? 1 : 0;
                updatedComments[commentIndex].cold_votes += payload.voteType === 'cold' ? 1 : 0;
            }
        }
        
        const success = await updateContentComments('summaries', commentingOn.id, updatedComments);
        if (success) {
            const updatedItem = {...commentingOn, comments: updatedComments };
            setAppData(prev => ({ ...prev, sources: prev.sources.map(s => s.id === updatedItem.source_id ? { ...s, summaries: s.summaries.map(sum => sum.id === updatedItem.id ? updatedItem : sum) } : s) }));
            setCommentingOn(updatedItem);
        }
    };
    
    const renderItem = (summary: Summary & { user_id: string, created_at: string}) => (
        <div id={`summary-${summary.id}`} key={summary.id} className="bg-background-light dark:bg-background-dark p-4 rounded-lg">
            <div onClick={() => setExpanded(expanded === summary.id ? null : summary.id)} className="cursor-pointer">
                <h3 className="text-xl font-bold">{summary.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{summary.source?.topic}</p>
                {expanded === summary.id && (
                    <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
                        {renderSummaryWithTooltips(summary)}
                    </div>
                )}
            </div>
            <ContentActions
                item={summary} contentType={contentType} currentUser={currentUser} interactions={appData.userContentInteractions}
                onVote={(id, type, inc) => handleVoteUpdate(setAppData, currentUser, updateUser, appData, contentType, id, type, inc)}
                onToggleRead={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, id, { is_read: !state })}
                onToggleFavorite={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, id, { is_favorite: !state })}
                onComment={() => setCommentingOn(summary)}
            />
        </div>
    );
    
    return (
        <>
            <CommentsModal isOpen={!!commentingOn} onClose={() => setCommentingOn(null)} comments={commentingOn?.comments || []} onAddComment={(text) => handleCommentAction('add', {text})} onVoteComment={(commentId, voteType) => handleCommentAction('vote', {commentId, voteType})} contentTitle={commentingOn?.title || ''}/>
            <GenerateContentModal 
                isOpen={generateModalOpen}
                onClose={() => setGenerateModalOpen(false)}
                sources={appData.sources}
                prompt={generationPrompt}
                contentType="summaries"
                isLoading={isGenerating}
                onGenerate={(ids, p) => handleGenerateNewContent(setAppData, appData, setIsGenerating, () => setGenerateModalOpen(false), 'summaries', ids, p)}
            />
            <ContentToolbar {...{ sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly, onAiFilter: handleAiFilter, onGenerate: handleOpenGenerateModal, isFiltering: !!aiFilterIds, onClearFilter: handleClearFilter }} />
            
            <div className="space-y-4">
                {Array.isArray(processedItems) 
                    ? processedItems.map(renderItem)
                    : Object.entries(processedItems as Record<string, any[]>).map(([groupKey, items]: [string, any[]]) => (
                        <details key={groupKey} open className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                            <summary className="text-xl font-bold cursor-pointer">{sort === 'user' ? (appData.users.find(u => u.id === groupKey)?.pseudonym || 'Desconhecido') : groupKey}</summary>
                            <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark space-y-4">
                                {items.map(renderItem)}
                            </div>
                        </details>
                    ))
                }
            </div>
        </>
    );
};

const FlashcardsView: React.FC<{ allItems: (Flashcard & { user_id: string, created_at: string})[]; appData: AppData; setAppData: React.Dispatch<React.SetStateAction<AppData>>; currentUser: User; updateUser: (user: User) => void; filterTerm: string | null; clearFilter: () => void; }> = ({ allItems, appData, setAppData, currentUser, updateUser, filterTerm, clearFilter }) => {
    const [flipped, setFlipped] = useState<string | null>(null);
    const [commentingOn, setCommentingOn] = useState<Flashcard | null>(null);
    const contentType: ContentType = 'flashcard';

    useEffect(() => {
        if (filterTerm) {
             const foundItem = allItems.find(item => item.front.toLowerCase().includes(filterTerm.toLowerCase()));
             if(foundItem) {
                setTimeout(() => {
                    const element = document.getElementById(`flashcard-${foundItem.id}`);
                    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
             }
            clearFilter();
        }
    }, [filterTerm, clearFilter, allItems]);

    const {
        sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly,
        aiFilterIds, isFiltering, isGenerating, setIsGenerating,
        generateModalOpen, setGenerateModalOpen, generationPrompt,
        processedItems, handleAiFilter, handleClearFilter, handleOpenGenerateModal
    } = useContentViewController(allItems, currentUser, appData, contentType);

    const handleCommentAction = async (action: 'add' | 'vote', payload: any) => {
        if (!commentingOn) return;
        let updatedComments = [...commentingOn.comments];
        if (action === 'add') {
            const newComment: Comment = { id: `c_${Date.now()}`, authorId: currentUser.id, authorPseudonym: currentUser.pseudonym, text: payload.text, timestamp: new Date().toISOString(), hot_votes: 0, cold_votes: 0 };
            updatedComments.push(newComment);
        } else if (action === 'vote') {
             const commentIndex = updatedComments.findIndex(c => c.id === payload.commentId);
            if (commentIndex > -1) {
                updatedComments[commentIndex].hot_votes += payload.voteType === 'hot' ? 1 : 0;
                updatedComments[commentIndex].cold_votes += payload.voteType === 'cold' ? 1 : 0;
            }
        }
        
        const success = await updateContentComments('flashcards', commentingOn.id, updatedComments);
        if (success) {
            const updatedItem = {...commentingOn, comments: updatedComments };
            setAppData(prev => ({ ...prev, sources: prev.sources.map(s => s.id === updatedItem.source_id ? { ...s, flashcards: s.flashcards.map(fc => fc.id === updatedItem.id ? updatedItem : fc) } : s) }));
            setCommentingOn(updatedItem);
        }
    };

    const handleFlip = (cardId: string) => {
        if (flipped !== cardId) {
            handleInteractionUpdate(setAppData, appData, currentUser, updateUser, 'flashcard', cardId, { is_read: true });
        }
        setFlipped(flipped === cardId ? null : cardId);
    };
    
    const renderItems = (items: any[]) => (
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {items.map(card => (
                 <div id={`flashcard-${card.id}`} key={card.id} className="[perspective:1000px] min-h-64 group flex flex-col">
                    <div className={`relative w-full flex-grow [transform-style:preserve-3d] transition-transform duration-700 ${flipped === card.id ? '[transform:rotateY(180deg)]' : ''}`} onClick={() => handleFlip(card.id)}>
                        <div className="absolute w-full h-full [backface-visibility:hidden] flex flex-col justify-between p-6 bg-card-light dark:bg-card-dark rounded-t-lg shadow-md border border-b-0 border-border-light dark:border-border-dark cursor-pointer">
                            <div>
                                <p className="text-xs text-gray-500">{card.source?.materia} - {card.source?.topic}</p>
                                <p className="text-lg font-semibold text-center mt-4 flex-grow flex items-center justify-center">{card.front}</p>
                            </div>
                            <div className="text-center text-xs text-gray-400">Clique para virar</div>
                        </div>
                        <div className="absolute w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col justify-center p-6 bg-primary-light dark:bg-primary-dark text-white rounded-t-lg shadow-md cursor-pointer">
                            <p className="text-lg text-center">{card.back}</p>
                        </div>
                    </div>
                    <div className="bg-background-light dark:bg-background-dark p-2 rounded-b-lg border border-t-0 border-border-light dark:border-border-dark">
                         <ContentActions
                            item={card} contentType={contentType} currentUser={currentUser} interactions={appData.userContentInteractions}
                            onVote={(id, type, inc) => handleVoteUpdate(setAppData, currentUser, updateUser, appData, contentType, id, type, inc)}
                            onToggleRead={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, id, { is_read: !state })}
                            onToggleFavorite={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, id, { is_favorite: !state })}
                            onComment={() => setCommentingOn(card)}
                        />
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <>
            <CommentsModal isOpen={!!commentingOn} onClose={() => setCommentingOn(null)} comments={commentingOn?.comments || []} onAddComment={(text) => handleCommentAction('add', {text})} onVoteComment={(commentId, voteType) => handleCommentAction('vote', {commentId, voteType})} contentTitle={commentingOn?.front || ''}/>
            <GenerateContentModal 
                isOpen={generateModalOpen}
                onClose={() => setGenerateModalOpen(false)}
                sources={appData.sources}
                prompt={generationPrompt}
                contentType="flashcards"
                isLoading={isGenerating}
                onGenerate={(ids, p) => handleGenerateNewContent(setAppData, appData, setIsGenerating, () => setGenerateModalOpen(false), 'flashcards', ids, p)}
            />
            <ContentToolbar {...{ sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly, onAiFilter: handleAiFilter, onGenerate: handleOpenGenerateModal, isFiltering: !!aiFilterIds, onClearFilter: handleClearFilter }} />
            
            <div className="space-y-6">
                {Array.isArray(processedItems) 
                    ? renderItems(processedItems)
                    : Object.entries(processedItems as Record<string, any[]>).map(([groupKey, items]: [string, any[]]) => (
                        <details key={groupKey} open className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                             <summary className="text-xl font-bold cursor-pointer">{sort === 'user' ? (appData.users.find(u => u.id === groupKey)?.pseudonym || 'Desconhecido') : groupKey}</summary>
                            <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark space-y-4">
                               {renderItems(items)}
                            </div>
                        </details>
                    ))
                }
            </div>
        </>
    );
};

const NotebookGridView: React.FC<{
    allItems: (Question & { user_id: string, created_at: string})[];
    appData: AppData;
    setAppData: React.Dispatch<React.SetStateAction<AppData>>;
    currentUser: User;
    onSelectNotebook: (notebook: QuestionNotebook | 'all') => void;
}> = ({ allItems, appData, setAppData, currentUser, onSelectNotebook }) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const favoritedQuestionIds = useMemo(() => {
        return appData.userContentInteractions
            .filter(i => i.user_id === currentUser.id && i.content_type === 'question' && i.is_favorite)
            .map(i => i.content_id);
    }, [appData.userContentInteractions, currentUser.id]);

    return (
        <>
            <CreateNotebookModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                appData={appData}
                setAppData={setAppData}
                currentUser={currentUser}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {/* Card para Novo Caderno */}
                <div 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex flex-col items-center justify-center text-center p-6 rounded-lg shadow-sm border-2 border-dashed border-border-light dark:border-border-dark cursor-pointer hover:shadow-md hover:border-primary-light dark:hover:border-primary-dark transition-all min-h-[120px]"
                >
                    <PlusIcon className="w-10 h-10 text-primary-light dark:text-primary-dark mb-2"/>
                    <h3 className="text-lg font-bold">Novo Caderno</h3>
                </div>

                {/* Card para Todas as Questões */}
                <div 
                    onClick={() => onSelectNotebook('all')}
                    className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark cursor-pointer hover:shadow-md hover:border-primary-light dark:hover:border-primary-dark transition-all flex flex-col justify-between min-h-[120px]"
                >
                    <div>
                        <h3 className="text-lg font-bold">Todas as Questões</h3>
                        <p className="text-sm text-gray-500">Acesse todas as questões disponíveis</p>
                    </div>
                    <p className="text-right font-bold text-primary-light dark:text-primary-dark mt-2">{allItems.length} Questões</p>
                </div>

                {/* Card para Favoritas */}
                {favoritedQuestionIds.length > 0 && (
                     <div 
                        onClick={() => {
                            const favoriteNotebook: QuestionNotebook = {
                                id: 'favorites_notebook', // Special ID
                                user_id: currentUser.id,
                                name: '⭐ Questões Favoritas',
                                question_ids: favoritedQuestionIds,
                                created_at: new Date().toISOString(),
                                hot_votes: 0, cold_votes: 0, comments: []
                            };
                            onSelectNotebook(favoriteNotebook);
                        }}
                        className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark cursor-pointer hover:shadow-md hover:border-yellow-500 dark:hover:border-yellow-400 transition-all flex flex-col justify-between min-h-[120px]"
                    >
                        <div>
                            <h3 className="text-lg font-bold">⭐ Questões Favoritas</h3>
                            <p className="text-sm text-gray-500">Suas questões mais importantes</p>
                        </div>
                        <p className="text-right font-bold text-yellow-500 dark:text-yellow-400 mt-2">{favoritedQuestionIds.length} Questões</p>
                    </div>
                )}


                {/* Cards de Cadernos existentes */}
                {appData.questionNotebooks.map(notebook => (
                    <div key={notebook.id} onClick={() => onSelectNotebook(notebook)} className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark cursor-pointer hover:shadow-md transition-all flex flex-col justify-between min-h-[120px]">
                        <div>
                            <h4 className="font-bold">{notebook.name}</h4>
                            <p className="text-xs text-gray-400 mt-1">por: {appData.users.find(u => u.id === notebook.user_id)?.pseudonym || 'Desconhecido'}</p>
                        </div>
                        <p className="text-right font-bold text-primary-light dark:text-primary-dark mt-2">{notebook.question_ids.length} Questões</p>
                    </div>
                ))}
            </div>
        </>
    );
};

const NotebookDetailView: React.FC<{
    notebook: QuestionNotebook | 'all';
    allQuestions: (Question & { user_id: string, created_at: string})[];
    appData: AppData;
    setAppData: React.Dispatch<React.SetStateAction<AppData>>;
    currentUser: User;
    updateUser: (user: User) => void;
    onBack: () => void;
}> = ({ notebook, allQuestions, appData, setAppData, currentUser, updateUser, onBack }) => {
    
    const [userAnswers, setUserAnswers] = useState<Map<string, UserQuestionAnswer>>(new Map());
    const notebookId = notebook === 'all' ? 'all_questions' : notebook.id;
    
    useEffect(() => {
        const answersForNotebook = appData.userQuestionAnswers.filter(
            ans => ans.user_id === currentUser.id && ans.notebook_id === notebookId
        );
        const answerMap = new Map(answersForNotebook.map(ans => [ans.question_id, ans]));
        setUserAnswers(answerMap);
    }, [appData.userQuestionAnswers, currentUser.id, notebookId]);

    const questions = useMemo(() => {
        if (notebook === 'all') return allQuestions;
        const idSet = new Set(notebook.question_ids);
        return allQuestions.filter(q => idSet.has(q.id));
    }, [notebook, allQuestions]);

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [wrongAnswers, setWrongAnswers] = useState<Set<string>>(new Set());
    const [isCompleted, setIsCompleted] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isQuestionStatsModalOpen, setIsQuestionStatsModalOpen] = useState(false);
    const [commentingOnQuestion, setCommentingOnQuestion] = useState<Question | null>(null);

    const currentQuestion = questions[currentQuestionIndex];
    
    // Reset state when question changes
    useEffect(() => {
        if (!currentQuestion) return;
        const savedAnswer = userAnswers.get(currentQuestion.id);
        if (savedAnswer) {
            const correct = savedAnswer.attempts.includes(currentQuestion.correctAnswer);
            setIsCompleted(true);
            setSelectedOption(correct ? currentQuestion.correctAnswer : savedAnswer.attempts[savedAnswer.attempts.length - 1]);
            setWrongAnswers(new Set(savedAnswer.attempts.filter(a => a !== currentQuestion.correctAnswer)));
        } else {
            setSelectedOption(null);
            setWrongAnswers(new Set());
            setIsCompleted(false);
        }
    }, [currentQuestionIndex, currentQuestion, userAnswers]);

    const handleCommentAction = async (action: 'add' | 'vote', payload: any) => {
        if (!commentingOnQuestion) return;
        let updatedComments = [...commentingOnQuestion.comments];
        if (action === 'add') {
            const newComment: Comment = { id: `c_${Date.now()}`, authorId: currentUser.id, authorPseudonym: currentUser.pseudonym, text: payload.text, timestamp: new Date().toISOString(), hot_votes: 0, cold_votes: 0 };
            updatedComments.push(newComment);
        } else if (action === 'vote') {
             const commentIndex = updatedComments.findIndex(c => c.id === payload.commentId);
            if (commentIndex > -1) {
                updatedComments[commentIndex].hot_votes += payload.voteType === 'hot' ? 1 : 0;
                updatedComments[commentIndex].cold_votes += payload.voteType === 'cold' ? 1 : 0;
            }
        }
        
        const success = await updateContentComments('questions', commentingOnQuestion.id, updatedComments);
        if (success) {
            const updatedItem = {...commentingOnQuestion, comments: updatedComments };
            setAppData(prev => ({ ...prev, sources: prev.sources.map(s => s.id === updatedItem.source_id ? { ...s, questions: s.questions.map(q => q.id === updatedItem.id ? updatedItem : q) } : s) }));
            setCommentingOnQuestion(updatedItem);
        }
    };


    const handleSelectOption = async (option: string) => {
        if (isCompleted || wrongAnswers.has(option)) return;

        setSelectedOption(option);
        const isCorrect = option === currentQuestion.correctAnswer;
        const newWrongAnswers = new Set(wrongAnswers);
        
        if (isCorrect) {
            setIsCompleted(true);
        } else {
            newWrongAnswers.add(option);
            setWrongAnswers(newWrongAnswers);
            if (newWrongAnswers.size >= 3) {
                setIsCompleted(true);
            }
        }

        // Save answer and update stats only on first completion
        const wasAnsweredBefore = userAnswers.has(currentQuestion.id);
        if ((isCorrect || newWrongAnswers.size >= 3) && !wasAnsweredBefore) {
            const attempts = [...newWrongAnswers, option];
            const isCorrectFirstTry = attempts.length === 1 && isCorrect;
            const xpMap = [10, 5, 2, 0]; // XP for 0, 1, 2, 3+ wrong answers
            const xpGained = isCorrect ? (xpMap[wrongAnswers.size] || 0) : 0;

            const answerPayload: Partial<UserQuestionAnswer> = {
                user_id: currentUser.id, notebook_id: notebookId, question_id: currentQuestion.id,
                attempts: attempts, is_correct_first_try: isCorrectFirstTry, xp_awarded: xpGained
            };
            const savedAnswer = await upsertUserQuestionAnswer(answerPayload);
            if (savedAnswer) {
                setAppData(prev => ({...prev, userQuestionAnswers: [...prev.userQuestionAnswers.filter(a => a.id !== savedAnswer.id), savedAnswer]}));
            }
            
            const newStats = { ...currentUser.stats };
            newStats.questionsAnswered = (newStats.questionsAnswered || 0) + 1;
            
            const currentStreak = currentUser.stats.streak || 0;
            newStats.streak = isCorrectFirstTry ? currentStreak + 1 : 0;

            if (isCorrectFirstTry) {
                newStats.correctAnswers = (newStats.correctAnswers || 0) + 1;
            }
            
            const topic = currentQuestion.source?.topic || 'Geral';
            if (!newStats.topicPerformance[topic]) newStats.topicPerformance[topic] = { correct: 0, total: 0 };
            newStats.topicPerformance[topic].total += 1;
            if (isCorrectFirstTry) newStats.topicPerformance[topic].correct += 1;
            
            const userWithNewStats = { ...currentUser, stats: newStats, xp: currentUser.xp + xpGained };
            const finalUser = checkAndAwardAchievements(userWithNewStats, appData);
            updateUser(finalUser);
        }
    };
    
    const navigateQuestion = (direction: 1 | -1) => {
        const newIndex = currentQuestionIndex + direction;
        if (newIndex >= 0 && newIndex < questions.length) {
            setCurrentQuestionIndex(newIndex);
        }
    };
    
    if (!currentQuestion) {
        return (
            <div>
                <button onClick={onBack} className="mb-4 text-primary-light dark:text-primary-dark hover:underline">&larr; Voltar</button>
                <p>Nenhuma questão encontrada neste caderno ou as questões estão sendo carregadas.</p>
            </div>
        );
    }
    
    const revealedHints = currentQuestion.hints.slice(0, wrongAnswers.size);
    const showAllHints = isCompleted && selectedOption === currentQuestion.correctAnswer;
    
    return (
      <>
        <CommentsModal 
            isOpen={!!commentingOnQuestion} 
            onClose={() => setCommentingOnQuestion(null)} 
            comments={commentingOnQuestion?.comments || []} 
            onAddComment={(text) => handleCommentAction('add', {text})} 
            onVoteComment={(commentId, voteType) => handleCommentAction('vote', {commentId, voteType})} 
            contentTitle={commentingOnQuestion?.questionText?.substring(0, 50) + '...' || ''}
        />

        {isStatsModalOpen && (
            <NotebookStatsModal
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                notebook={notebook}
                appData={appData}
                currentUser={currentUser}
                onClearAnswers={async () => {
                    if(window.confirm("Tem certeza que deseja limpar suas respostas para este caderno? Seu progresso será zerado.")) {
                        const success = await clearNotebookAnswers(currentUser.id, notebookId);
                        if (success) {
                            setAppData(prev => ({...prev, userQuestionAnswers: prev.userQuestionAnswers.filter(a => !(a.user_id === currentUser.id && a.notebook_id === notebookId)) }));
                            setIsStatsModalOpen(false);
                            setCurrentQuestionIndex(0); // Go back to start
                        } else {
                            alert("Não foi possível limpar as respostas.");
                        }
                    }
                }}
            />
        )}
        {isQuestionStatsModalOpen && (
             <QuestionStatsModal
                isOpen={isQuestionStatsModalOpen}
                onClose={() => setIsQuestionStatsModalOpen(false)}
                question={currentQuestion}
                appData={appData}
            />
        )}
        <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
            <div className="flex justify-between items-center mb-4">
                <button onClick={onBack} className="text-primary-light dark:text-primary-dark hover:underline">&larr; Voltar</button>
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsStatsModalOpen(true)} title="Ver estatísticas do caderno">
                        <ChartBarSquareIcon className="w-6 h-6 text-gray-500 hover:text-primary-light"/>
                    </button>
                    <span className="font-semibold">{currentQuestionIndex + 1} / {questions.length}</span>
                </div>
            </div>
            
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-6">
                <div className="bg-primary-light h-2.5 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}></div>
            </div>

            <h2 className="text-xl font-semibold mb-4">{currentQuestion?.questionText || 'Carregando enunciado...'}</h2>

            <div className="space-y-3">
                {(currentQuestion?.options || []).map((option, index) => {
                    const isSelected = selectedOption === option;
                    const isWrong = wrongAnswers.has(option);
                    const isCorrect = option === currentQuestion.correctAnswer;

                    let optionClass = "bg-background-light dark:bg-background-dark border-border-light dark:border-border-dark hover:border-primary-light dark:hover:border-primary-dark";
                    let cursorClass = "cursor-pointer";

                    if (isCompleted) {
                        cursorClass = "cursor-default";
                        if (isCorrect) optionClass = "bg-green-100 dark:bg-green-900/50 border-green-500";
                        else if (isWrong && isSelected) optionClass = "bg-red-100 dark:bg-red-900/50 border-red-500"; // Highlight selected wrong answer
                        else optionClass = "bg-background-light dark:bg-background-dark opacity-60";
                    } else {
                        if (isWrong) {
                             optionClass = "bg-red-100 dark:bg-red-900/50 border-red-500 opacity-60";
                             cursorClass = "cursor-not-allowed";
                        }
                        else if (isSelected) optionClass = "bg-primary-light/10 dark:bg-primary-dark/20 border-primary-light dark:border-primary-dark";
                    }

                    return (
                        <div key={index} onClick={() => handleSelectOption(option)}
                             className={`p-4 border rounded-lg transition-colors ${optionClass} ${cursorClass}`}>
                             <span>{option}</span>
                        </div>
                    );
                })}
            </div>

            {isCompleted && (
                <div className="mt-6 p-4 rounded-lg bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark">
                    <h3 className={`text-lg font-bold ${selectedOption === currentQuestion.correctAnswer ? 'text-green-600' : 'text-red-600'}`}>
                        {selectedOption === currentQuestion.correctAnswer ? "Resposta Correta!" : "Você errou 3 vezes!"}
                    </h3>
                    <p className="mt-2">{currentQuestion.explanation}</p>
                </div>
            )}
            
             <ContentActions
                item={currentQuestion} contentType='question' currentUser={currentUser} interactions={appData.userContentInteractions}
                onVote={(id, type, inc) => handleVoteUpdate(setAppData, currentUser, updateUser, appData, 'question', id, type, inc)}
                onToggleRead={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, 'question', id, { is_read: !state })}
                onToggleFavorite={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, 'question', id, { is_favorite: !state })}
                onComment={() => setCommentingOnQuestion(currentQuestion)}
                extraActions={
                    <button onClick={() => setIsQuestionStatsModalOpen(true)} className="text-gray-500 hover:text-primary-light flex items-center gap-1" title="Estatísticas da questão">
                        <Cog6ToothIcon className="w-5 h-5"/>
                    </button>
                }
            />

            <div className="mt-6 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <button onClick={() => navigateQuestion(-1)} disabled={currentQuestionIndex === 0} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md disabled:opacity-50">Anterior</button>
                    <button onClick={() => navigateQuestion(1)} disabled={currentQuestionIndex === questions.length - 1} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md disabled:opacity-50">Próxima</button>
                </div>

                <div className="relative group">
                    <span className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                        <LightBulbIcon className="w-5 h-5" /> Dicas ({showAllHints ? currentQuestion.hints.length : revealedHints.length}/{currentQuestion.hints.length})
                    </span>
                </div>

                {isCompleted ? (
                    <button onClick={() => navigateQuestion(1)} className="px-6 py-2 bg-primary-light text-white font-bold rounded-md hover:bg-indigo-700 disabled:opacity-50" disabled={currentQuestionIndex === questions.length - 1}>
                        Próxima Questão
                    </button>
                ) : (
                    <button disabled={!selectedOption || wrongAnswers.has(selectedOption)} onClick={() => handleSelectOption(selectedOption!)} className="px-6 py-2 bg-secondary-light text-white font-bold rounded-md hover:bg-emerald-600 disabled:opacity-50">
                        Confirmar
                    </button>
                )}
            </div>

            {(revealedHints.length > 0 || showAllHints) && (
                <div className="mt-4 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
                    <ul className="list-disc list-inside space-y-1">
                        {(showAllHints ? currentQuestion.hints : revealedHints).map((hint, i) => <li key={i}>{hint}</li>)}
                    </ul>
                </div>
            )}
        </div>
      </>
    );
};

const QuestionsView: React.FC<{ allItems: (Question & { user_id: string, created_at: string})[]; appData: AppData; setAppData: React.Dispatch<React.SetStateAction<AppData>>; currentUser: User; updateUser: (user:User) => void; filterTerm: string | null; clearFilter: () => void; }> = ({ allItems, appData, setAppData, currentUser, updateUser, filterTerm, clearFilter }) => {
    const [selectedNotebook, setSelectedNotebook] = useState<QuestionNotebook | 'all' | null>(null);

    useEffect(() => {
        if (filterTerm) {
            const notebook = appData.questionNotebooks.find(n => n.name.toLowerCase() === filterTerm.toLowerCase());
            if (notebook) {
                setSelectedNotebook(notebook);
            } else {
                alert(`Caderno de questões "${filterTerm}" não encontrado.`);
            }
            clearFilter();
        }
    }, [filterTerm, clearFilter, appData.questionNotebooks]);


    if (selectedNotebook) {
        return <NotebookDetailView 
            notebook={selectedNotebook}
            allQuestions={allItems}
            appData={appData}
            setAppData={setAppData}
            currentUser={currentUser}
            updateUser={updateUser}
            onBack={() => setSelectedNotebook(null)}
        />
    }

    return <NotebookGridView 
        allItems={allItems}
        appData={appData}
        setAppData={setAppData}
        currentUser={currentUser}
        onSelectNotebook={setSelectedNotebook}
    />;
};

const MindMapsView: React.FC<{ allItems: (MindMap & { user_id: string, created_at: string})[]; appData: AppData, setAppData: React.Dispatch<React.SetStateAction<AppData>>; currentUser: User; updateUser: (user: User) => void; }> = ({ allItems, appData, setAppData, currentUser, updateUser }) => {
    const [commentingOn, setCommentingOn] = useState<MindMap | null>(null);
    const contentType: ContentType = 'mind_map';

    const {
        sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly,
        isFiltering, aiFilterIds,
        processedItems, handleAiFilter, handleClearFilter,
    } = useContentViewController(allItems, currentUser, appData, contentType);

    const handleCommentAction = async (action: 'add' | 'vote', payload: any) => {
        if (!commentingOn) return;
        let updatedComments = [...(commentingOn.comments || [])];
        if (action === 'add') {
            const newComment: Comment = { id: `c_${Date.now()}`, authorId: currentUser.id, authorPseudonym: currentUser.pseudonym, text: payload.text, timestamp: new Date().toISOString(), hot_votes: 0, cold_votes: 0 };
            updatedComments.push(newComment);
        } else if (action === 'vote') {
             const commentIndex = updatedComments.findIndex(c => c.id === payload.commentId);
            if (commentIndex > -1) {
                updatedComments[commentIndex].hot_votes += payload.voteType === 'hot' ? 1 : 0;
                updatedComments[commentIndex].cold_votes += payload.voteType === 'cold' ? 1 : 0;
            }
        }
        
        const success = await updateContentComments('mind_maps', commentingOn.id, updatedComments);
        if (success) {
            const updatedItem = {...commentingOn, comments: updatedComments };
            setAppData(prev => ({ ...prev, sources: prev.sources.map(s => s.id === updatedItem.source_id ? { ...s, mind_maps: s.mind_maps.map(mm => mm.id === updatedItem.id ? updatedItem : mm) } : s) }));
            setCommentingOn(updatedItem);
        }
    };
    
    const renderItems = (items: any[]) => (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {items.map(map => (
                <div key={map.id} className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                    <h3 className="text-xl font-bold mb-2">{map.title}</h3>
                     <p className="text-xs text-gray-500 mb-4">Fonte: {map.source?.title}</p>
                    <img src={map.imageUrl} alt={map.title} className="w-full h-auto rounded-md border border-border-light dark:border-border-dark"/>
                    <ContentActions
                        item={map} contentType={contentType} currentUser={currentUser} interactions={appData.userContentInteractions}
                        onVote={(id, type, inc) => handleVoteUpdate(setAppData, currentUser, updateUser, appData, contentType, id, type, inc)}
                        onToggleRead={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, id, { is_read: !state })}
                        onToggleFavorite={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, id, { is_favorite: !state })}
                        onComment={() => setCommentingOn(map)}
                    />
                </div>
            ))}
        </div>
    );

    return(
        <>
            <CommentsModal isOpen={!!commentingOn} onClose={() => setCommentingOn(null)} comments={commentingOn?.comments || []} onAddComment={(text) => handleCommentAction('add', {text})} onVoteComment={(commentId, voteType) => handleCommentAction('vote', {commentId, voteType})} contentTitle={commentingOn?.title || ''}/>
            <ContentToolbar {...{ sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly, onAiFilter: handleAiFilter, onGenerate: undefined, isFiltering: !!aiFilterIds, onClearFilter: handleClearFilter }} />
            
             <div className="space-y-4">
                {Array.isArray(processedItems) 
                    ? renderItems(processedItems)
                    : Object.entries(processedItems as Record<string, any[]>).map(([groupKey, items]: [string, any[]]) => (
                        <details key={groupKey} open className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                             <summary className="text-xl font-bold cursor-pointer">{sort === 'user' ? (appData.users.find(u => u.id === groupKey)?.pseudonym || 'Desconhecido') : groupKey}</summary>
                            <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark space-y-4">
                                {renderItems(items)}
                            </div>
                        </details>
                    ))
                }
            </div>
        </>
    );
}

const AddAudioModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    setAppData: React.Dispatch<React.SetStateAction<AppData>>,
    currentUser: User
}> = ({ isOpen, onClose, setAppData, currentUser }) => {
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    
    const handleAdd = async () => {
        if (!file || !title.trim()) {
            alert("Por favor, preencha o título e anexe um arquivo.");
            return;
        }
        setIsLoading(true);
        try {
            // 1. Create a new source for this audio file
            const sourcePayload: Partial<Source> = {
                user_id: currentUser.id,
                title: title.trim(),
                summary: `Resumo em áudio: ${file.name}`,
                original_filename: [file.name],
                storage_path: [], // Will be updated after upload
                materia: 'Áudio',
                topic: 'Upload de Usuário',
                hot_votes: 0,
                cold_votes: 0,
                comments: []
            };
            const newSource = await addSource(sourcePayload);
            if (!newSource) throw new Error("Falha ao criar a fonte para o áudio.");

            // 2. Upload the file
            const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const sanitizedName = sanitizeFileName(file.name);
            const filePath = `${currentUser.id}/audio/${Date.now()}_${sanitizedName}`;
            const { error: uploadError } = await supabase!.storage.from('sources').upload(filePath, file);
            if (uploadError) throw uploadError;

            // 3. Update source with storage path
            await updateSource(newSource.id, { storage_path: [filePath] });
            newSource.storage_path = [filePath];

            const { data: { publicUrl } } = supabase!.storage.from('sources').getPublicUrl(filePath);

            // 4. Create the audio summary record
            const audioPayload: Partial<AudioSummary> = {
                title: title.trim(),
                audioUrl: publicUrl,
                source_id: newSource.id,
                hot_votes: 0,
                cold_votes: 0,
                comments: []
            };
            const newAudio = await addAudioSummary(audioPayload);
            if (!newAudio) throw new Error("Falha ao salvar o resumo em áudio.");
            
            // 5. Update app state
            const newSourceWithContent: Source = {
                ...newSource,
                summaries: [], flashcards: [], questions: [], mind_maps: [],
                audio_summaries: [newAudio]
            };
            setAppData(prev => ({ ...prev, sources: [newSourceWithContent, ...prev.sources] }));
            onClose();

        } catch(error: any) {
            alert(`Erro: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) {
            setFile(null);
            setTitle("");
            setIsLoading(false);
        }
    }, [isOpen]);
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Adicionar Resumo em Áudio">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Título</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Arquivo (Áudio ou Vídeo MP4)</label>
                    <input type="file" accept="audio/*,video/mp4" onChange={e => setFile(e.target.files ? e.target.files[0] : null)} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-light/10 file:text-primary-light hover:file:bg-primary-light/20" />
                </div>
                <button onClick={handleAdd} disabled={isLoading} className="mt-4 w-full bg-primary-light text-white font-bold py-2 px-4 rounded-md transition disabled:opacity-50">
                    {isLoading ? "Adicionando..." : "Adicionar"}
                </button>
            </div>
        </Modal>
    );
};


const AudioSummariesView: React.FC<{ allItems: (AudioSummary & { user_id: string, created_at: string})[], appData: AppData, setAppData: React.Dispatch<React.SetStateAction<AppData>>, currentUser: User, updateUser: (user: User) => void }> = ({ allItems, appData, setAppData, currentUser, updateUser }) => {
    const [commentingOn, setCommentingOn] = useState<(AudioSummary & { user_id: string, created_at: string}) | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const contentType: ContentType = 'audio_summary';

    const {
        sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly,
        aiFilterIds, isFiltering,
        processedItems, handleAiFilter, handleClearFilter,
    } = useContentViewController(allItems, currentUser, appData, contentType);

    const handleCommentAction = async (action: 'add' | 'vote', payload: any) => {
        if (!commentingOn) return;
        let updatedComments = [...(commentingOn.comments || [])];
        if (action === 'add') {
            const newComment: Comment = { id: `c_${Date.now()}`, authorId: currentUser.id, authorPseudonym: currentUser.pseudonym, text: payload.text, timestamp: new Date().toISOString(), hot_votes: 0, cold_votes: 0 };
            updatedComments.push(newComment);
        } else if (action === 'vote') {
             const commentIndex = updatedComments.findIndex(c => c.id === payload.commentId);
            if (commentIndex > -1) {
                updatedComments[commentIndex].hot_votes += payload.voteType === 'hot' ? 1 : 0;
                updatedComments[commentIndex].cold_votes += payload.voteType === 'cold' ? 1 : 0;
            }
        }
        
        const success = await updateContentComments('audio_summaries', commentingOn.id, updatedComments);
        if (success) {
            const updatedItem = {...commentingOn, comments: updatedComments };
            setAppData(prev => ({ ...prev, sources: prev.sources.map(s => s.id === updatedItem.source_id ? { ...s, audio_summaries: s.audio_summaries.map(as => as.id === updatedItem.id ? updatedItem : as) } : s) }));
            setCommentingOn(updatedItem);
        }
    };
    
    const renderItem = (audio: AudioSummary & { user_id: string, created_at: string}) => (
        <div key={audio.id} className="bg-background-light dark:bg-background-dark p-4 rounded-lg">
            <h3 className="text-xl font-bold mb-2">{audio.title}</h3>
            <p className="text-xs text-gray-500 mb-4">{audio.source?.topic}</p>
            <audio controls className="w-full">
                <source src={audio.audioUrl} type={audio.audioUrl.includes('.mp4') ? 'video/mp4' : 'audio/mpeg'} />
                Seu navegador não suporta este elemento de áudio.
            </audio>
            <ContentActions
                item={audio} contentType={contentType} currentUser={currentUser} interactions={appData.userContentInteractions}
                onVote={(id, type, inc) => handleVoteUpdate(setAppData, currentUser, updateUser, appData, contentType, id, type, inc)}
                onToggleRead={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, id, { is_read: !state })}
                onToggleFavorite={(id, state) => handleInteractionUpdate(setAppData, appData, currentUser, updateUser, contentType, id, { is_favorite: !state })}
                onComment={() => setCommentingOn(audio)}
            />
        </div>
    );
    
    return(
        <>
            <AddAudioModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} setAppData={setAppData} currentUser={currentUser} />
            <CommentsModal isOpen={!!commentingOn} onClose={() => setCommentingOn(null)} comments={commentingOn?.comments || []} onAddComment={(text) => handleCommentAction('add', {text})} onVoteComment={(commentId, voteType) => handleCommentAction('vote', {commentId, voteType})} contentTitle={commentingOn?.title || ''}/>
            <div className="flex justify-end mb-4">
                <button onClick={() => setIsAddModalOpen(true)} className="px-4 py-2 bg-primary-light text-white font-semibold rounded-md hover:bg-indigo-600 flex items-center gap-2">
                    <PlusIcon className="w-5 h-5" /> Adicionar Áudio
                </button>
            </div>
            <ContentToolbar {...{ sort, setSort, filter, setFilter, favoritesOnly, setFavoritesOnly, onAiFilter: handleAiFilter, onGenerate: undefined, isFiltering: !!aiFilterIds, onClearFilter: handleClearFilter }} />
            
            <div className="space-y-4">
                {Array.isArray(processedItems) 
                    ? processedItems.map(renderItem)
                    : Object.entries(processedItems as Record<string, any[]>).map(([groupKey, items]: [string, any[]]) => (
                        <details key={groupKey} open className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                             <summary className="text-xl font-bold cursor-pointer">{sort === 'user' ? (appData.users.find(u => u.id === groupKey)?.pseudonym || 'Desconhecido') : groupKey}</summary>
                            <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark space-y-4">
                                {items.map(renderItem)}
                            </div>
                        </details>
                    ))
                }
            </div>
        </>
    );
};

// =================================================================
// OTHER VIEWS (Community, Chat, Profile, Admin, Sources)
// =================================================================

const CommunityView: React.FC<{ appData: AppData, currentUser: User, setAppData: React.Dispatch<React.SetStateAction<AppData>>; onNavigate: (viewName: string, term: string) => void; }> = ({ appData, currentUser, setAppData, onNavigate }) => {
    const sortedUsers = [...appData.users].sort((a, b) => b.xp - a.xp);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <h3 className="text-2xl font-bold mb-4">Leaderboard</h3>
                <div className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                    <ul className="space-y-3">
                        {sortedUsers.map((user, index) => (
                            <li key={user.id} className={`flex items-center justify-between p-2 rounded-md ${user.id === currentUser.id ? 'bg-primary-light/20' : 'bg-background-light dark:bg-background-dark'}`}>
                                <div className="flex items-center">
                                    <span className="font-bold text-lg w-8">{index + 1}.</span>
                                    <span className="font-semibold">{user.pseudonym}</span>
                                </div>
                                <span className="font-bold text-primary-light dark:text-primary-dark">{user.xp} XP</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <div className="lg:col-span-2">
                <Chat currentUser={currentUser} appData={appData} setAppData={setAppData} onNavigate={onNavigate} />
            </div>
        </div>
    );
};

const Chat: React.FC<{currentUser: User, appData: AppData, setAppData: React.Dispatch<React.SetStateAction<AppData>>; onNavigate: (viewName: string, term: string) => void;}> = ({currentUser, appData, setAppData, onNavigate}) => {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sortOrder, setSortOrder] = useState<'time' | 'temp'>('time');
    const [activeVote, setActiveVote] = useState<{ messageId: string; type: 'hot' | 'cold' } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const votePopupRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }
    useEffect(scrollToBottom, [appData.chatMessages]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (votePopupRef.current && !votePopupRef.current.contains(event.target as Node)) {
                setActiveVote(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    
    useEffect(() => {
        if (!supabase) return;

        const handleChatMessage = (payload: any, eventType: 'INSERT' | 'UPDATE') => {
             setAppData(prev => {
                let newMessages = [...prev.chatMessages];
                const existingIndex = newMessages.findIndex(m => m.id === payload.new.id);
                if (existingIndex > -1) {
                    if (eventType === 'UPDATE') newMessages[existingIndex] = payload.new;
                } else if (eventType === 'INSERT') {
                    newMessages.push(payload.new);
                }
                return { ...prev, chatMessages: newMessages };
            });
        }
        
        const handleUserVote = (payload: any) => {
             setAppData(prev => {
                let newVotes = [...prev.userMessageVotes];
                const existingIndex = newVotes.findIndex(v => v.id === payload.new.id);
                if (existingIndex > -1) {
                    newVotes[existingIndex] = payload.new;
                } else {
                    newVotes.push(payload.new);
                }
                return { ...prev, userMessageVotes: newVotes };
            });
        }

        const chatChannel = supabase.channel('public:chat_messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => handleChatMessage(payload, 'INSERT'))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => handleChatMessage(payload, 'UPDATE'))
            .subscribe();
            
        const voteChannel = supabase.channel('public:user_message_votes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_message_votes' }, handleUserVote)
            .subscribe();

        return () => {
            supabase.removeChannel(chatChannel);
            supabase.removeChannel(voteChannel);
        };
    }, [setAppData]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMessage: Omit<ChatMessage, 'id' | 'hot_votes' | 'cold_votes'> = { author: currentUser.pseudonym, text: input, timestamp: new Date().toISOString() };
        
        const insertedMessage = await addChatMessage(userMessage);

        const lowerInput = input.toLowerCase();
        if (insertedMessage && (lowerInput.includes('@ia') || lowerInput.includes('@ed'))) {
            setIsLoading(true);
            const history = appData.chatMessages.filter(m => m.author === currentUser.pseudonym || m.author === 'IA').map(m => ({
                role: m.author === currentUser.pseudonym ? 'user' : 'model',
                parts: [{ text: m.text }]
            }));
            
            const aiResponseText = await getSimpleChatResponse(history, input);
            const aiMessage: Omit<ChatMessage, 'id' | 'hot_votes' | 'cold_votes'> = { author: 'IA', text: aiResponseText, timestamp: new Date().toISOString() };
            await addChatMessage(aiMessage);
            setIsLoading(false);
        }
        setInput('');
    };
    
    const handleVote = async (messageId: string, type: 'hot' | 'cold', increment: 1 | -1) => {
        const userVote = appData.userMessageVotes.find(v => v.user_id === currentUser.id && v.message_id === messageId);
        if (increment === -1) {
            if (type === 'hot' && (userVote?.hot_votes || 0) <= 0) return;
            if (type === 'cold' && (userVote?.cold_votes || 0) <= 0) return;
        }

        const message = appData.chatMessages.find(m => m.id === messageId);
        const author = message ? appData.users.find(u => u.pseudonym === message.author) : null;
        const isOwnContent = !author || author.id === currentUser.id;

        setAppData(prev => {
            const newVotes = prev.userMessageVotes.map(v => 
                (v.user_id === currentUser.id && v.message_id === messageId)
                ? { ...v, [`${type}_votes`]: v[`${type}_votes`] + increment }
                : v
            );
            if (!newVotes.some(v => v.user_id === currentUser.id && v.message_id === messageId)) {
                 newVotes.push({ id: `temp_${Date.now()}`, user_id: currentUser.id, message_id: messageId, hot_votes: type === 'hot' ? 1 : 0, cold_votes: type === 'cold' ? 1 : 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
            }

            const newMessages = prev.chatMessages.map(m => 
                m.id === messageId ? { ...m, [`${type}_votes`]: m[`${type}_votes`] + increment } : m
            );
            return { ...prev, userMessageVotes: newVotes, chatMessages: newMessages };
        });

        await upsertUserVote('user_message_votes', { user_id: currentUser.id, message_id: messageId, hot_votes_increment: type === 'hot' ? increment : 0, cold_votes_increment: type === 'cold' ? increment : 0 }, ['user_id', 'message_id']);
        await incrementVoteCount('increment_message_vote', messageId, `${type}_votes`, increment);

        if (author && !isOwnContent) {
            const xpChange = (type === 'hot' ? 1 : -1) * increment;
            const updatedAuthor = { ...author, xp: author.xp + xpChange };
            const result = await supabaseUpdateUser(updatedAuthor);
            if (result) {
                setAppData(prev => ({
                    ...prev,
                    users: prev.users.map(u => u.id === result.id ? result : u),
                }));
            }
        }
    }
    
    const formatTimestamp = (isoString: string) => {
        const date = new Date(isoString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month} ${hours}:${minutes}`;
    };

    const sortedMessages = useMemo(() => {
        const messages = [...appData.chatMessages];
        if (sortOrder === 'time') {
            return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }
        if (sortOrder === 'temp') {
            return messages.sort((a, b) => {
                const tempA = (a.hot_votes || 0) - (a.cold_votes || 0);
                const tempB = (b.hot_votes || 0) - (b.cold_votes || 0);
                if (tempB !== tempA) return tempB - tempA;
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            });
        }
        return messages;
    }, [appData.chatMessages, sortOrder]);

    const parseAndRenderMessage = (text: string, onNavigate: (view: string, term: string) => void) => {
        const parts = [];
        let lastIndex = 0;
        const regex = /(\#\[[^\]]+\])|(\!\[[^\]]+\])|(\?\[[^\]]+\])/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }

            const fullMatch = match[0];
            const term = fullMatch.substring(2, fullMatch.length - 1);
            let viewName = '';

            if (fullMatch.startsWith('#[')) viewName = 'Resumos';
            else if (fullMatch.startsWith('![')) viewName = 'Flash Cards';
            else if (fullMatch.startsWith('?[')) viewName = 'Questões';
            
            parts.push(
                <span
                    key={match.index}
                    className="text-blue-500 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                    onClick={() => onNavigate(viewName, term)}
                >
                    {fullMatch}
                </span>
            );
            
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return parts;
    };


    return (
         <div className="flex flex-col h-[70vh] bg-card-light dark:bg-card-dark rounded-lg shadow-md border border-border-light dark:border-border-dark">
            <div className="flex justify-between items-center p-4 border-b border-border-light dark:border-border-dark">
                <h3 className="text-2xl font-bold">Chat Geral</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => setSortOrder('time')} className={`p-2 rounded-full ${sortOrder === 'time' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                        <span className="text-2xl">🕐</span>
                    </button>
                    <button onClick={() => setSortOrder('temp')} className={`p-2 rounded-full ${sortOrder === 'temp' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                        <span className="text-2xl">🌡️</span>
                    </button>
                </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-6">
                    {sortedMessages.map(msg => {
                        const isCurrentUser = msg.author === currentUser.pseudonym;
                        const userVote = appData.userMessageVotes.find(v => v.user_id === currentUser.id && v.message_id === msg.id);
                        return (
                            <div key={msg.id} className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                                <div className={`flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                                    <span className="font-bold">{msg.author}</span>
                                    <span>{formatTimestamp(msg.timestamp)}</span>
                                </div>
                                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                                    isCurrentUser ? 'bg-primary-light text-white rounded-br-none' : 
                                    msg.author === 'IA' ? 'bg-secondary-light/20 dark:bg-secondary-dark/30 rounded-bl-none' : 
                                    'bg-gray-200 dark:bg-gray-700 rounded-bl-none'
                                }`}>
                                    <p className="whitespace-pre-wrap">{parseAndRenderMessage(msg.text, onNavigate)}</p>
                                </div>
                                 <div className="flex items-center gap-4 relative mt-2">
                                    <button onClick={() => setActiveVote({ messageId: msg.id, type: 'hot' })} className="flex items-center gap-1 text-base">
                                        <span className="text-lg">🔥</span><span>{msg.hot_votes || 0}</span>
                                    </button>
                                    <button onClick={() => setActiveVote({ messageId: msg.id, type: 'cold' })} className="flex items-center gap-1 text-base">
                                        <span className="text-lg">❄️</span><span>{msg.cold_votes || 0}</span>
                                    </button>
                                    {activeVote?.messageId === msg.id && (
                                         <div ref={votePopupRef} className="absolute top-full mt-1 z-10 bg-black/70 backdrop-blur-sm text-white rounded-full flex items-center p-1 gap-1 shadow-lg">
                                            <button onClick={() => handleVote(msg.id, activeVote.type, 1)} className="p-1 hover:bg-white/20 rounded-full"><PlusIcon className="w-4 h-4" /></button>
                                            <span className="text-sm font-bold w-4 text-center">
                                                {activeVote.type === 'hot' ? (userVote?.hot_votes || 0) : (userVote?.cold_votes || 0)}
                                            </span>
                                            <button onClick={() => handleVote(msg.id, activeVote.type, -1)} className="p-1 hover:bg-white/20 rounded-full"><MinusIcon className="w-4 h-4" /></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                    {isLoading && (
                        <div className="flex items-start">
                            <div className="flex flex-col items-start">
                                <span className="font-bold text-sm text-gray-500 dark:text-gray-400 mb-1">IA</span>
                                <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-secondary-light/20 dark:bg-secondary-dark/30 rounded-bl-none">
                                    <div className="flex items-center space-x-1"><span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></span><span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-75"></span><span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-150"></span></div>
                                </div>
                            </div>
                        </div>
                    )}
                     <div ref={messagesEndRef} />
                </div>
            </div>
            <div className="p-4 border-t border-border-light dark:border-border-dark">
                <div className="flex items-center">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Digite sua mensagem... (@IA ou @ed para chamar o assistente)" className="flex-1 px-3 py-2 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-l-md focus:outline-none focus:ring-2 focus:ring-primary-light"/>
                    <button onClick={handleSend} disabled={isLoading} className="bg-primary-light text-white p-3 rounded-r-md disabled:opacity-50"><PaperAirplaneIcon className="w-5 h-5"/></button>
                </div>
            </div>
        </div>
    );
};

const ProfileView: React.FC<{ user: User, appData: AppData, setAppData: React.Dispatch<React.SetStateAction<AppData>>, updateUser: (user: User) => void, onNavigate: (viewName: string, term: string) => void; }> = ({ user, appData, setAppData, updateUser, onNavigate }) => {
    const { correctAnswers, questionsAnswered, topicPerformance } = user.stats;
    const overallAccuracy = questionsAnswered > 0 ? (correctAnswers / questionsAnswered) * 100 : 0;
    const pieData = [ { name: 'Corretas', value: correctAnswers }, { name: 'Incorretas', value: questionsAnswered - correctAnswers } ];
    const COLORS = ['#10b981', '#ef4444'];
    const barData = Object.entries(topicPerformance).map(([topic, data]: [string, { correct: number; total: number }]) => ({
        name: topic,
        Acerto: data.total > 0 ? (data.correct / data.total) * 100 : 0,
    }));
    
    const [studyPlan, setStudyPlan] = useState("");
    const [loadingPlan, setLoadingPlan] = useState(false);
    const [commentingOnNotebook, setCommentingOnNotebook] = useState<QuestionNotebook | null>(null);
    
    const [notebookSort, setNotebookSort] = useState<SortOption>('time');

    const handleGeneratePlan = async () => {
        setLoadingPlan(true);
        const allSummaries = appData.sources.flatMap(s => s.summaries);
        const allFlashcards = appData.sources.flatMap(s => s.flashcards);
        
        const content = {
            summaries: allSummaries,
            flashcards: allFlashcards,
            notebooks: appData.questionNotebooks
        };

        const plan = await getPersonalizedStudyPlan(user.stats, appData.userContentInteractions, content);
        setStudyPlan(plan);
        setLoadingPlan(false);
    }
    
    const parseAndRenderMessage = (text: string) => {
        const parts: (string | React.ReactElement)[] = [];
        let lastIndex = 0;
        const regex = /(\#\[[^\]]+\])|(\!\[[^\]]+\])|(\?\[[^\]]+\])/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }

            const fullMatch = match[0];
            const term = fullMatch.substring(2, fullMatch.length - 1);
            let viewName = '';

            if (fullMatch.startsWith('#[')) viewName = 'Resumos';
            else if (fullMatch.startsWith('![')) viewName = 'Flash Cards';
            else if (fullMatch.startsWith('?[')) viewName = 'Questões';
            
            parts.push(
                <span
                    key={match.index}
                    className="text-blue-500 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                    onClick={() => onNavigate(viewName, term)}
                >
                    {fullMatch}
                </span>
            );
            
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }

        return <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{parts}</div>;
    };

    const userNotebooks = useMemo(() => {
        const notebooks = appData.questionNotebooks.filter(n => n.user_id === user.id);
        switch (notebookSort) {
            case 'time':
                return notebooks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            case 'temp':
                return notebooks.sort((a, b) => (b.hot_votes - b.cold_votes) - (a.hot_votes - a.cold_votes));
            default:
                return notebooks;
        }
    }, [appData.questionNotebooks, user.id, notebookSort]);

    const handleNotebookInteractionUpdate = async (notebookId: string, update: Partial<UserNotebookInteraction>) => {
        // Optimistic UI update
        let newInteractions = [...appData.userNotebookInteractions];
        const existingIndex = newInteractions.findIndex(i => i.user_id === user.id && i.notebook_id === notebookId);
        if (existingIndex > -1) {
            newInteractions[existingIndex] = { ...newInteractions[existingIndex], ...update };
        } else {
            newInteractions.push({ id: `temp-nb-${Date.now()}`, user_id: user.id, notebook_id: notebookId, is_read: false, is_favorite: false, hot_votes: 0, cold_votes: 0, ...update });
        }
        setAppData(prev => ({...prev, userNotebookInteractions: newInteractions }));

        // DB update
        const result = await upsertUserVote('user_notebook_interactions', { user_id: user.id, notebook_id: notebookId, ...update }, ['user_id', 'notebook_id']);
        if (!result) {
            console.error("Failed to update notebook interaction.");
            // Revert on failure
            setAppData(appData);
        }
    };
    
    const handleNotebookVote = async (notebookId: string, type: 'hot' | 'cold', increment: 1 | -1) => {
        const interaction = appData.userNotebookInteractions.find(i => i.user_id === user.id && i.notebook_id === notebookId);
        const currentVoteCount = (type === 'hot' ? interaction?.hot_votes : interaction?.cold_votes) || 0;
        if (increment === -1 && currentVoteCount <= 0) return;

        handleNotebookInteractionUpdate(notebookId, { [`${type}_votes`]: currentVoteCount + increment });
        
        setAppData(prev => ({ ...prev, questionNotebooks: prev.questionNotebooks.map(n => n.id === notebookId ? { ...n, [`${type}_votes`]: n[`${type}_votes`] + increment } : n) }));
        
        await incrementVoteCount('increment_notebook_vote', notebookId, `${type}_votes`, increment);
    };

     const handleNotebookCommentAction = async (action: 'add' | 'vote', payload: any) => {
        if (!commentingOnNotebook) return;
        let updatedComments = [...commentingOnNotebook.comments];
        if (action === 'add') {
            updatedComments.push({ id: `c_${Date.now()}`, authorId: user.id, authorPseudonym: user.pseudonym, text: payload.text, timestamp: new Date().toISOString(), hot_votes: 0, cold_votes: 0 });
        } else {
             const commentIndex = updatedComments.findIndex(c => c.id === payload.commentId);
            if (commentIndex > -1) updatedComments[commentIndex][`${payload.voteType}_votes`] += 1;
        }
        
        const success = await updateContentComments('question_notebooks', commentingOnNotebook.id, updatedComments);
        if (success) {
            const updatedItem = {...commentingOnNotebook, comments: updatedComments };
            setAppData(prev => ({ ...prev, questionNotebooks: prev.questionNotebooks.map(n => n.id === updatedItem.id ? updatedItem : n) }));
            setCommentingOnNotebook(updatedItem);
        }
    };

    return (
        <div className="space-y-8">
            <CommentsModal 
                isOpen={!!commentingOnNotebook}
                onClose={() => setCommentingOnNotebook(null)}
                comments={commentingOnNotebook?.comments || []}
                onAddComment={(text) => handleNotebookCommentAction('add', { text })}
                onVoteComment={(id, type) => handleNotebookCommentAction('vote', { commentId: id, voteType: type })}
                contentTitle={commentingOnNotebook?.name || ''}
            />

            <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Plano de Estudos Personalizado (IA)</h3>
                    <button onClick={handleGeneratePlan} disabled={loadingPlan} className="bg-secondary-light hover:bg-emerald-600 dark:bg-secondary-dark dark:hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-md transition duration-300 disabled:opacity-50 flex items-center gap-2">
                       <SparklesIcon className="w-5 h-5"/> {loadingPlan ? 'Gerando...' : 'Gerar/Atualizar Plano'}
                    </button>
                </div>
                {studyPlan ? parseAndRenderMessage(studyPlan) : <p className="text-gray-500 dark:text-gray-400">Clique no botão para que a IA gere um plano de estudos com base em seu desempenho e interações.</p>}
            </div>

            <div className="bg-card-light dark:bg-card-dark p-8 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                <div className="flex items-center space-x-6 mb-6">
                    <div className="w-24 h-24 bg-primary-light/20 rounded-full flex items-center justify-center">
                        <UserCircleIcon className="w-20 h-20 text-primary-light dark:text-primary-dark" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold">{user.pseudonym}</h2>
                        <p className="text-lg text-gray-600 dark:text-gray-300">Continue de onde parou e avance em seus estudos.</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-background-light dark:bg-background-dark p-4 rounded-lg text-center">
                        <p className="text-lg font-semibold">Nível</p>
                        <p className="text-3xl font-bold text-primary-light dark:text-primary-dark">{user.level}</p>
                    </div>
                    <div className="bg-background-light dark:bg-background-dark p-4 rounded-lg text-center">
                        <p className="text-lg font-semibold">XP</p>
                        <p className="text-3xl font-bold text-primary-light dark:text-primary-dark">{user.xp}</p>
                    </div>
                    <div className="bg-background-light dark:bg-background-dark p-4 rounded-lg text-center">
                        <p className="text-lg font-semibold">Conquistas</p>
                        <p className="text-3xl font-bold text-primary-light dark:text-primary-dark">{user.achievements.length}</p>
                    </div>
                </div>
                 <div className="mt-8">
                    <h3 className="text-xl font-semibold mb-4">Progresso para o próximo Nível</h3>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-2">
                        <div className="bg-secondary-light dark:bg-secondary-dark h-4 rounded-full" style={{ width: `${(user.xp % 100)}%` }}></div>
                    </div>
                    <p className="text-right text-sm text-gray-500">{user.xp % 100} / 100 XP</p>
                </div>
                <div className="mt-8">
                    <h3 className="text-xl font-semibold mb-4">Conquistas</h3>
                    {user.achievements.length > 0 ? (
                        <div className="flex flex-wrap gap-4">
                            {user.achievements.map((ach, i) => (
                                <div key={i} className="flex items-center space-x-2 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 p-3 rounded-lg" title={ach}>
                                <span>🏆</span>
                                <span className="font-semibold">{ach}</span>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-gray-500 dark:text-gray-400">Continue estudando para desbloquear conquistas!</p>}
                </div>
            </div>

             <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                <h3 className="text-2xl font-bold mb-4">Meus Cadernos de Questões</h3>
                <ContentToolbar sort={notebookSort} setSort={setNotebookSort as (s: SortOption) => void} />
                <div className="space-y-4">
                    {userNotebooks.length > 0 ? userNotebooks.map(notebook => (
                        <div key={notebook.id} className="bg-background-light dark:bg-background-dark p-4 rounded-lg">
                            <h4 className="font-bold">{notebook.name}</h4>
                            <p className="text-sm text-gray-500">{notebook.question_ids.length} questões</p>
                            <ContentActions
                                item={notebook}
                                contentType="question_notebook"
                                currentUser={user}
                                interactions={appData.userNotebookInteractions.filter(i => i.user_id === user.id)}
                                onVote={(id, type, inc) => handleNotebookVote(id, type, inc)}
                                onToggleRead={(id, state) => handleNotebookInteractionUpdate(id, { is_read: !state })}
                                onToggleFavorite={(id, state) => handleNotebookInteractionUpdate(id, { is_favorite: !state })}
                                onComment={() => setCommentingOnNotebook(notebook)}
                            />
                        </div>
                    )) : <p className="text-gray-500">Você ainda não criou nenhum caderno de questões.</p>}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                    <h3 className="text-xl font-bold mb-4">Desempenho Geral</h3>
                     <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value">
                                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    <p className="text-center text-2xl font-bold">{overallAccuracy.toFixed(1)}% de Acerto</p>
                </div>
                <div className="lg:col-span-2 bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                    <h3 className="text-xl font-bold mb-4">Desempenho por Matéria (%)</h3>
                     <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={barData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="Acerto" fill="#4f46e5" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const AdminView: React.FC<{ appData: AppData; setAppData: React.Dispatch<React.SetStateAction<AppData>>; }> = ({ appData, setAppData }) => {
    const handleDeleteUser = (userId: string) => {
        if (window.confirm("Tem certeza que deseja remover este usuário? Esta ação é irreversível.")) {
            setAppData({ ...appData, users: appData.users.filter(u => u.id !== userId) });
        }
    };

    return (
        <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
            <h2 className="text-2xl font-bold mb-4">Gerenciamento de Usuários</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-border-light dark:border-border-dark">
                            <th className="p-2 text-foreground-light dark:text-foreground-dark">Pseudônimo</th>
                            <th className="p-2 text-foreground-light dark:text-foreground-dark">Senha</th>
                            <th className="p-2 text-foreground-light dark:text-foreground-dark">Nível</th>
                            <th className="p-2 text-foreground-light dark:text-foreground-dark">XP</th>
                            <th className="p-2 text-foreground-light dark:text-foreground-dark">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {appData.users.filter(u => u.pseudonym !== 'admin').map(user => (
                            <tr key={user.id} className="border-b border-border-light dark:border-border-dark">
                                <td className="p-2 text-foreground-light dark:text-foreground-dark">{user.pseudonym}</td>
                                <td className="p-2 text-foreground-light dark:text-foreground-dark">{user.password}</td>
                                <td className="p-2 text-foreground-light dark:text-foreground-dark">{user.level}</td>
                                <td className="p-2 text-foreground-light dark:text-foreground-dark">{user.xp}</td>
                                <td className="p-2">
                                    <button onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:text-red-700 font-semibold">Remover</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ExploreSourceModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    onConfirm: (prompt: string) => void,
    sourceTitle: string,
    isLoading: boolean,
}> = ({ isOpen, onClose, onConfirm, sourceTitle, isLoading }) => {
    const [prompt, setPrompt] = useState("");
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Explorar Mais Conteúdo em "${sourceTitle}"`}>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                A IA irá reanalisar a fonte para encontrar conteúdo inédito. Você pode guiar a busca com um prompt opcional.
            </p>
            <textarea 
                value={prompt} 
                onChange={e => setPrompt(e.target.value)} 
                placeholder="Ex: 'Crie mais questões sobre o Comitê de Política Monetária (COPOM)'"
                className="w-full h-24 p-2 mb-4 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded-md"
            />
            <button
                onClick={() => onConfirm(prompt)}
                disabled={isLoading}
                className="w-full bg-secondary-light text-white font-bold py-2 px-4 rounded-md transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
                {isLoading ? 'Explorando...' : <> <SparklesIcon className="w-5 h-5"/> Encontrar Conteúdo Inédito </>}
            </button>
        </Modal>
    )
}

const SourcesView: React.FC<{
    appData: AppData, 
    setAppData: React.Dispatch<React.SetStateAction<AppData>>, 
    currentUser: User,
    processingTasks: {id: string, name: string, message: string, status: 'processing' | 'success' | 'error'}[],
    setProcessingTasks: React.Dispatch<React.SetStateAction<{id: string, name: string, message: string, status: 'processing' | 'success' | 'error'}[]>>
}> = ({ appData, setAppData, currentUser, processingTasks, setProcessingTasks }) => {
    const [prompt, setPrompt] = useState<string>("");
    const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
    const [isSelectSourceModalOpen, setSelectSourceModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [displayMode, setDisplayMode] = useState<'time' | 'temp' | 'user' | 'subject'>('time');
    const [activeVote, setActiveVote] = useState<{ sourceId: string; type: 'hot' | 'cold' } | null>(null);
    const [commentingOn, setCommentingOn] = useState<Source | null>(null);
    const [editingSource, setEditingSource] = useState<{ id: string; title: string } | null>(null);
    const [sourceToDelete, setSourceToDelete] = useState<Source | null>(null);
    const [exploringSource, setExploringSource] = useState<Source | null>(null);
    const votePopupRef = useRef<HTMLDivElement>(null);
    
    const base64ToBlob = (base64: string, mimeType: string): Blob => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            const allowedTypes = ["application/pdf", "text/plain", "image/jpeg", "image/png", "audio/mpeg", "audio/wav", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
            const newFiles = Array.from(files).filter(file => {
                if (allowedTypes.includes(file.type)) {
                    return true;
                } else {
                    alert(`Tipo de arquivo não suportado: ${file.name}`);
                    return false;
                }
            });
             setAttachedFiles(prev => {
                const existingNames = new Set(prev.map(f => f.name));
                const uniqueNewFiles = newFiles.filter(f => !existingNames.has(f.name));
                return [...prev, ...uniqueNewFiles];
            });
        }
        if(event.target) event.target.value = '';
    };

    const handleRemoveFile = (fileName: string) => {
        setAttachedFiles(prev => prev.filter(f => f.name !== fileName));
    };

    const handleSelectSourcesForPrompt = (selectedSourceIds: string[]) => {
        handleProcessSource(selectedSourceIds);
        setSelectSourceModalOpen(false);
    }
    
    const handleProcessSource = (contextSourceIds?: string[]) => {
        if (attachedFiles.length === 0 && !prompt.trim()) {
            alert("Por favor, anexe um ou mais arquivos ou escreva um prompt para gerar conteúdo.");
            return;
        }

        if (attachedFiles.length === 0 && prompt.trim() && !contextSourceIds) {
            setSelectSourceModalOpen(true);
            return;
        }

        const taskId = `task_${Date.now()}`;
        const taskName = attachedFiles.length > 0 ? attachedFiles.map(f => f.name).join(', ') : `Prompt: ${prompt.substring(0, 30)}...`;
        
        const currentFiles = [...attachedFiles];
        const currentPrompt = prompt;

        setProcessingTasks(prev => [...prev, { id: taskId, name: taskName, status: 'processing', message: 'Iniciando...' }]);
        setAttachedFiles([]);
        setPrompt("");

        (async () => {
            const updateTask = (message: string, status?: 'processing' | 'success' | 'error') => {
                setProcessingTasks(prev => prev.map(t => t.id === taskId ? { ...t, message, ...(status && { status }) } : t));
            };

            try {
                let generatedData;
                let finalStoragePaths: string[] = [];
                let finalOriginalFilenames: string[] = [];

                if (currentFiles.length > 0) {
                    updateTask("Lendo os arquivos...");
                    const textBasedFiles = currentFiles.filter(f => f.type === "text/plain" || f.type === "application/pdf" || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
                    if (textBasedFiles.length === 0) {
                        throw new Error("Nenhum arquivo de texto (PDF, TXT, DOCX) foi fornecido para análise de conteúdo.");
                    }
                    const fileContents = await Promise.all(textBasedFiles.map(async file => {
                        if (file.type === "text/plain") return file.text();
                        if (file.type === "application/pdf") {
                            const typedarray = new Uint8Array(await file.arrayBuffer());
                            const pdf = await pdfjsLib.getDocument(typedarray).promise;
                            let text = '';
                            for (let i = 1; i <= pdf.numPages; i++) {
                                const page = await pdf.getPage(i);
                                const content = await page.getTextContent();
                                text += content.items.map((item: any) => item.str).join(' ') + '\n';
                            }
                            return text;
                        }
                        if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                            const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
                            return result.value;
                        }
                        return "";
                    }));
                    const combinedTextContent = fileContents.join('\n\n---\n\n');
                    updateTask("Analisando o conteúdo com a IA...");
                    const existingTopics = appData.sources.map(s => ({ materia: s.materia, topic: s.topic }));
                    generatedData = await processAndGenerateAllContentFromSource(combinedTextContent, existingTopics);
                } else {
                    updateTask("Gerando conteúdo a partir do prompt...");
                    const contextSources = appData.sources.filter(s => contextSourceIds!.includes(s.id));
                    generatedData = await generateContentFromPromptAndSources(currentPrompt, contextSources);
                    finalOriginalFilenames.push(`Gerado a partir do prompt: "${currentPrompt}"`);
                }
                
                if (generatedData.error) throw new Error(generatedData.error);

                let mindMapPayload = [];
                if (generatedData.mindMapTopics && generatedData.mindMapTopics.length > 0) {
                    for (let i = 0; i < generatedData.mindMapTopics.length; i++) {
                        const topic = generatedData.mindMapTopics[i];
                        updateTask(`Gerando mapa mental ${i + 1}/${generatedData.mindMapTopics.length}: ${topic.title}...`);
                        const imageResult = await generateImageForMindMap(topic.prompt);
                        if (imageResult.base64Image) {
                            const imageBlob = base64ToBlob(imageResult.base64Image, 'image/png');
                            const mindMapFile = new File([imageBlob], `mindmap_${Date.now()}_${i}.png`, { type: 'image/png' });
                            const mindMapPath = `${currentUser.id}/mind_maps/${mindMapFile.name}`;
                            const { error } = await supabase!.storage.from('sources').upload(mindMapPath, mindMapFile);
                            if (!error) {
                                const { data: { publicUrl } } = supabase!.storage.from('sources').getPublicUrl(mindMapPath);
                                mindMapPayload.push({ title: topic.title, imageUrl: publicUrl });
                            }
                        }
                    }
                }
                
                if (currentFiles.length > 0) {
                    updateTask("Salvando arquivos no banco de dados...");
                    const sanitize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '');
                    const uploads = await Promise.all(currentFiles.map(file => {
                        const path = `${currentUser.id}/${Date.now()}_${sanitize(file.name)}`;
                        return supabase!.storage.from('sources').upload(path, file).then(res => ({...res, file}));
                    }));
                    uploads.forEach(res => {
                        if (res.error) throw new Error(`Erro ao salvar ${res.file.name}: ${res.error.message}`);
                        finalStoragePaths.push(res.data.path);
                        finalOriginalFilenames.push(res.file.name);
                    });
                }

                updateTask("Finalizando...");
                const sourcePayload: Partial<Source> = { user_id: currentUser.id, title: generatedData.title, summary: generatedData.summary, original_filename: finalOriginalFilenames, storage_path: finalStoragePaths, materia: generatedData.materia, topic: generatedData.topic, hot_votes: 0, cold_votes: 0, comments: [] };
                const newSource = await addSource(sourcePayload);
                if (!newSource) throw new Error("Falha ao criar o registro da fonte.");
                
                const createdContent = await addGeneratedContent(newSource.id, {...generatedData, mind_maps: mindMapPayload });
                if (!createdContent) throw new Error("Falha ao salvar o conteúdo gerado.");

                const newSourceWithContent: Source = {
                    ...newSource,
                    summaries: createdContent.summaries,
                    flashcards: createdContent.flashcards,
                    questions: createdContent.questions,
                    mind_maps: createdContent.mind_maps,
                    audio_summaries: [],
                };
                setAppData(prev => ({ ...prev, sources: [newSourceWithContent, ...prev.sources]}));
                
                updateTask("Fonte processada com sucesso!", 'success');
                setTimeout(() => {
                    setProcessingTasks(prev => prev.filter(t => t.id !== taskId));
                }, 5000);

            } catch (error: any) {
                updateTask(`Erro: ${error.message}`, 'error');
            }
        })();
    };

    const handleCommentAction = async (action: 'add' | 'vote', payload: any) => {
        if (!commentingOn) return;
        let updatedComments = [...(commentingOn.comments || [])];
        if (action === 'add') {
            const newComment: Comment = { id: `c_${Date.now()}`, authorId: currentUser.id, authorPseudonym: currentUser.pseudonym, text: payload.text, timestamp: new Date().toISOString(), hot_votes: 0, cold_votes: 0 };
            updatedComments.push(newComment);
        } else if (action === 'vote') {
             const commentIndex = updatedComments.findIndex(c => c.id === payload.commentId);
            if (commentIndex > -1) {
                updatedComments[commentIndex].hot_votes += payload.voteType === 'hot' ? 1 : 0;
                updatedComments[commentIndex].cold_votes += payload.voteType === 'cold' ? 1 : 0;
            }
        }
        
        const success = await updateContentComments('sources', commentingOn.id, updatedComments);
        if (success) {
            const updatedSource = {...commentingOn, comments: updatedComments };
            setAppData(prev => ({ ...prev, sources: prev.sources.map(s => s.id === updatedSource.id ? updatedSource : s) }));
            setCommentingOn(updatedSource);
        }
    };
    
    const handleSourceVote = async (sourceId: string, type: 'hot' | 'cold', increment: 1 | -1) => {
        const userVote = appData.userSourceVotes.find(v => v.user_id === currentUser.id && v.source_id === sourceId);
        if (increment === -1) {
            if (type === 'hot' && (userVote?.hot_votes || 0) <= 0) return;
            if (type === 'cold' && (userVote?.cold_votes || 0) <= 0) return;
        }

        const source = appData.sources.find(s => s.id === sourceId);
        const author = source ? appData.users.find(u => u.id === source.user_id) : null;
        const isOwnContent = !author || author.id === currentUser.id;

        setAppData(prev => {
            const newVotes = [...prev.userSourceVotes];
            const voteIndex = newVotes.findIndex(v => v.user_id === currentUser.id && v.source_id === sourceId);
            if(voteIndex > -1) {
                newVotes[voteIndex] = {...newVotes[voteIndex], [`${type}_votes`]: newVotes[voteIndex][`${type}_votes`] + increment};
            } else {
                newVotes.push({ id: `temp_${Date.now()}`, user_id: currentUser.id, source_id: sourceId, hot_votes: type === 'hot' ? 1 : 0, cold_votes: type === 'cold' ? 1 : 0 });
            }
            
            const newSources = prev.sources.map(s => 
                s.id === sourceId ? { ...s, [`${type}_votes`]: s[`${type}_votes`] + increment } : s
            );
            return { ...prev, userSourceVotes: newVotes, sources: newSources };
        });

        await upsertUserVote('user_source_votes', { user_id: currentUser.id, source_id: sourceId, hot_votes_increment: type === 'hot' ? increment : 0, cold_votes_increment: type === 'cold' ? increment : 0 }, ['user_id', 'source_id']);
        await incrementVoteCount('increment_source_vote', sourceId, `${type}_votes`, increment);

        if (author && !isOwnContent) {
            const xpChange = (type === 'hot' ? 1 : -1) * increment;
            const updatedAuthor = { ...author, xp: author.xp + xpChange };
            const result = await supabaseUpdateUser(updatedAuthor);
            if (result) {
                setAppData(prev => ({
                    ...prev,
                    users: prev.users.map(u => u.id === result.id ? result : u)
                }));
            }
        }
    };

    const handleStartEditing = (source: Source) => {
        setEditingSource({ id: source.id, title: source.title });
    };
    const handleCancelEditing = () => setEditingSource(null);
    const handleSaveTitle = async () => {
        if (!editingSource || !editingSource.title.trim()) {
            handleCancelEditing();
            return;
        }
        const originalSource = appData.sources.find(s => s.id === editingSource.id);
        if (originalSource && originalSource.title !== editingSource.title) {
            setAppData(prev => ({ ...prev, sources: prev.sources.map(s => s.id === editingSource.id ? { ...s, title: editingSource.title } : s) }));
            const updated = await updateSource(editingSource.id, { title: editingSource.title });
            if (!updated) {
                setAppData(prev => ({ ...prev, sources: prev.sources.map(s => s.id === editingSource.id ? originalSource : s) }));
                alert("Falha ao atualizar o título.");
            }
        }
        setEditingSource(null);
    };

    const handleConfirmDelete = async () => {
        if (!sourceToDelete) return;
        const success = await deleteSource(sourceToDelete.id, sourceToDelete.storage_path);
        if (success) {
            setAppData(prev => ({
                ...prev,
                sources: prev.sources.filter(s => s.id !== sourceToDelete.id)
            }));
        } else {
            alert("Falha ao excluir a fonte. Tente novamente.");
        }
        setSourceToDelete(null);
    };

    const handleExploreSource = async (userPrompt: string) => {
        if (!exploringSource) return;

        try {
            const source = exploringSource;
            // Simplified context for now; a more robust solution might fetch full text
            const textContent = `Título: ${source.title}\nResumo: ${source.summary}`; 
            const existingContent = {
                summaries: source.summaries.map(s => ({ title: s.title, content: s.content })),
                flashcards: source.flashcards.map(f => ({ front: f.front, back: f.back })),
                questions: source.questions.map(q => ({ questionText: q.questionText })),
            }
            const newContent = await generateMoreContentFromSource(textContent, existingContent, userPrompt);

            if (newContent.error) throw new Error(newContent.error);
            if (newContent.summaries.length === 0 && newContent.flashcards.length === 0 && newContent.questions.length === 0) {
                alert("Nenhum conteúdo inédito encontrado para este tópico.");
                return;
            }

            const added = await appendGeneratedContentToSource(source.id, newContent);
            if (added) {
                setAppData(prev => ({
                    ...prev,
                    sources: prev.sources.map(s => s.id === source.id ? {
                        ...s,
                        summaries: [...s.summaries, ...added.newSummaries],
                        flashcards: [...s.flashcards, ...added.newFlashcards],
                        questions: [...s.questions, ...added.newQuestions],
                    } : s)
                }));
                alert("Novo conteúdo adicionado com sucesso!");
            }

        } catch(error: any) {
            alert(`Erro ao explorar a fonte: ${error.message}`);
        } finally {
            setExploringSource(null);
        }
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (votePopupRef.current && !votePopupRef.current.contains(event.target as Node)) {
                setActiveVote(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const processedSources = useMemo(() => {
        const sources = [...appData.sources];
        if (displayMode === 'time') {
            return sources.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
        if (displayMode === 'temp') {
            return sources.sort((a, b) => {
                const tempA = (a.hot_votes || 0) - (a.cold_votes || 0);
                const tempB = (b.hot_votes || 0) - (b.cold_votes || 0);
                if (tempB !== tempA) return tempB - tempA;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
        }
        if (displayMode === 'user' || displayMode === 'subject') {
            const key = displayMode === 'user' ? 'user_id' : 'materia';
            return sources.reduce((acc, source) => {
                const groupKey = source[key as keyof Source] as string || 'Outros';
                if (!acc[groupKey]) acc[groupKey] = [];
                acc[groupKey].push(source);
                return acc;
            }, {} as Record<string, Source[]>);
        }
        return sources;
    }, [appData.sources, displayMode]);
    
    const SourceItemContent: React.FC<{source: Source}> = ({ source }) => {
        const isOwner = source.user_id === currentUser.id;
        const isEditing = editingSource?.id === source.id;
        const userVote = appData.userSourceVotes.find(v => v.user_id === currentUser.id && v.source_id === source.id);
        
        const contentCounts = [
            { icon: BookOpenIcon, count: source.summaries.length, label: "Resumos" },
            { icon: SparklesIcon, count: source.flashcards.length, label: "Flash Cards" },
            { icon: QuestionMarkCircleIcon, count: source.questions.length, label: "Questões" },
            { icon: ShareIcon, count: source.mind_maps.length, label: "Mapas Mentais" },
            { icon: SpeakerWaveIcon, count: source.audio_summaries.length, label: "Resumos em Áudio" },
        ];
        
        return (
             <details key={source.id} className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark data-[grouped='true']:bg-background-light data-[grouped='true']:dark:bg-background-dark">
                <summary className="flex justify-between items-start cursor-pointer">
                    <div className="flex-1 min-w-0">
                        {isEditing ? (
                            <input type="text" value={editingSource!.title} autoFocus
                                onChange={(e) => editingSource && setEditingSource({ ...editingSource, title: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') handleCancelEditing(); }}
                                onBlur={handleSaveTitle}
                                onClick={e => e.stopPropagation()}
                                className="w-full text-xl font-bold bg-transparent border-b-2 border-primary-light outline-none"
                            />
                        ) : (
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-bold">{source.title}</p>
                                {isOwner && (
                                    <div className="flex items-center">
                                        <button onClick={(e) => { e.stopPropagation(); handleStartEditing(source); }} className="text-gray-400 hover:text-primary-light dark:hover:text-primary-dark transition-colors p-1" title="Editar título">
                                            <PencilIcon className="w-4 h-4" />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setSourceToDelete(source); }} className="text-gray-400 hover:text-red-500 transition-colors p-1" title="Excluir fonte">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                        <button disabled={!!exploringSource} onClick={(e) => { e.stopPropagation(); setExploringSource(source); }} className="text-gray-400 hover:text-secondary-light dark:hover:text-secondary-dark transition-colors p-1 disabled:opacity-50 disabled:cursor-wait" title="Explorar mais conteúdo com IA">
                                            {exploringSource?.id === source.id ? <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <SparklesIcon className="w-4 h-4" />}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <p className="text-sm text-gray-500">{source.materia} &gt; {source.topic}</p>
                        <p className="text-xs text-gray-400 mt-1">Adicionado por {appData.users.find(u => u.id === source.user_id)?.pseudonym || 'Desconhecido'} em {new Date(source.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-4 relative ml-4 flex-shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setActiveVote({ sourceId: source.id, type: 'hot' })}} className="flex items-center gap-1 text-base">
                            <span className="text-lg">🔥</span><span>{source.hot_votes || 0}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setActiveVote({ sourceId: source.id, type: 'cold' })}} className="flex items-center gap-1 text-base">
                            <span className="text-lg">❄️</span><span>{source.cold_votes || 0}</span>
                        </button>
                        {activeVote?.sourceId === source.id && (
                             <div ref={votePopupRef} className="absolute top-full mt-1 z-10 bg-black/70 backdrop-blur-sm text-white rounded-full flex items-center p-1 gap-1 shadow-lg" onClick={e => e.stopPropagation()}>
                                <button onClick={() => handleSourceVote(source.id, activeVote.type, 1)} className="p-1 hover:bg-white/20 rounded-full"><PlusIcon className="w-4 h-4" /></button>
                                <span className="text-sm font-bold w-4 text-center">
                                    {activeVote.type === 'hot' ? (userVote?.hot_votes || 0) : (userVote?.cold_votes || 0)}
                                </span>
                                <button onClick={() => handleSourceVote(source.id, activeVote.type, -1)} className="p-1 hover:bg-white/20 rounded-full"><MinusIcon className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>
                </summary>
                <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
                    <p className="italic">{source.summary}</p>
                    <div className="flex items-center gap-4 my-3 text-sm">
                        {contentCounts.map((item, index) => item.count > 0 && (
                            <div key={index} className="flex items-center gap-1.5" title={item.label}>
                                <item.icon className="w-4 h-4 text-gray-500" />
                                <span className="font-semibold">{item.count}</span>
                            </div>
                        ))}
                    </div>
                     {source.original_filename && source.original_filename.length > 0 && (
                        <div className="mt-4">
                            <h4 className="font-semibold text-sm">Arquivos:</h4>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {source.original_filename.map((filename, index) => {
                                    if(!source.storage_path || !source.storage_path[index]) return null;
                                    const { data: { publicUrl } } = supabase!.storage.from('sources').getPublicUrl(source.storage_path[index]);
                                    return (
                                        <a
                                            key={`${source.id}-${index}`}
                                            href={publicUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 bg-background-light dark:bg-background-dark hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-1 rounded-md border border-border-light dark:border-border-dark text-sm transition-colors"
                                        >
                                            <DocumentTextIcon className="w-4 h-4 flex-shrink-0" />
                                            <span className="truncate" title={filename}>{filename}</span>
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <button 
                        onClick={(e) => { e.stopPropagation(); setCommentingOn(source); }} 
                        className="text-sm text-primary-light dark:text-primary-dark mt-4 hover:underline"
                    >
                        Comentários ({(source.comments || []).length})
                    </button>
                </div>
            </details>
        );
    };

    return (
        <div className="space-y-8">
            <div className="bg-card-light dark:bg-card-dark p-6 rounded-lg shadow-md border border-border-light dark:border-border-dark">
                <h2 className="text-2xl font-bold mb-4">Adicionar Nova Fonte</h2>
                <p className="text-sm text-gray-500 mb-4">Anexe arquivos (PDF, DOCX, TXT) ou descreva um tópico para que a IA gere um conjunto completo de materiais de estudo. O processamento é feito em segundo plano.</p>
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ou simplesmente digite um prompt/pergunta. A IA pedirá para selecionar fontes existentes como contexto..."
                    className="w-full h-24 p-3 rounded-md bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark focus:ring-2 focus:ring-primary-light"
                />
                <div className="mt-2 space-y-2">
                    {attachedFiles.map(file => (
                        <div key={file.name} className="flex items-center justify-between bg-background-light dark:bg-background-dark p-2 rounded-md border border-border-light dark:border-border-dark">
                            <span className="text-sm truncate">{file.name}</span>
                            <button onClick={() => handleRemoveFile(file.name)} className="text-red-500 hover:text-red-700">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-md border border-border-light dark:border-border-dark hover:bg-gray-100 dark:hover:bg-gray-700">
                        <PaperClipIcon className="w-5 h-5"/> Anexar Arquivos
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" accept=".pdf,.txt,.docx" />
                    <button onClick={() => handleProcessSource()} className="px-6 py-2 bg-primary-light text-white font-bold rounded-md hover:bg-indigo-600 disabled:opacity-50">
                        Processar
                    </button>
                </div>
            </div>
            {exploringSource && (
                <ExploreSourceModal
                    isOpen={!!exploringSource}
                    onClose={() => setExploringSource(null)}
                    sourceTitle={exploringSource.title}
                    isLoading={false} // This can be managed internally if needed
                    onConfirm={handleExploreSource}
                />
            )}
            <CommentsModal 
                isOpen={!!commentingOn}
                onClose={() => setCommentingOn(null)}
                comments={commentingOn?.comments || []}
                onAddComment={(text) => handleCommentAction('add', {text})}
                onVoteComment={(commentId, voteType) => handleCommentAction('vote', {commentId, voteType})}
                contentTitle={commentingOn?.title || ''}
            />
            {sourceToDelete && (
                <Modal
                    isOpen={!!sourceToDelete}
                    onClose={() => setSourceToDelete(null)}
                    title="Confirmar Exclusão"
                >
                    <div className="p-4">
                        <p className="text-foreground-light dark:text-foreground-dark">
                            Tem certeza que deseja excluir a fonte "<strong>{sourceToDelete.title}</strong>"?
                        </p>
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                            Todos os resumos, flashcards e questões associados serão permanentemente removidos. Esta ação não pode ser desfeita.
                        </p>
                        <div className="mt-6 flex justify-end gap-4">
                            <button
                                onClick={() => setSourceToDelete(null)}
                                className="px-4 py-2 rounded-md border border-border-light dark:border-border-dark hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold"
                            >
                                Excluir
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

             {processingTasks.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold mb-4">Processamento em Andamento</h3>
                    <div className="space-y-3">
                        {processingTasks.map(task => (
                            <div key={task.id} className="bg-card-light dark:bg-card-dark p-4 rounded-lg border border-border-light dark:border-border-dark">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold truncate">{task.name}</p>
                                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${task.status === 'processing' ? 'bg-blue-200 text-blue-800 animate-pulse' : task.status === 'success' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                        {task.status}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 mt-1">{task.message}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
             <div>
                <h3 className="text-xl font-bold mb-4">Fontes Adicionadas</h3>
                <div className="flex items-center justify-between gap-4 text-sm bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark mb-6">
                    <span className="font-semibold">Agrupar por:</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setDisplayMode('time')} title="Data" className={`p-2 rounded-full ${displayMode === 'time' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>🕐</button>
                        <button onClick={() => setDisplayMode('temp')} title="Temperatura" className={`p-2 rounded-full ${displayMode === 'temp' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>🌡️</button>
                        <button onClick={() => setDisplayMode('user')} title="Usuário" className={`p-2 rounded-full ${displayMode === 'user' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>👤</button>
                        <button onClick={() => setDisplayMode('subject')} title="Matéria" className={`p-2 rounded-full ${displayMode === 'subject' ? 'bg-primary-light/20' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>📚</button>
                    </div>
                </div>
                 <div className="space-y-4">
                    {Array.isArray(processedSources) 
                        ? processedSources.map(source => <SourceItemContent key={source.id} source={source} />)
                        : Object.entries(processedSources as Record<string, Source[]>).map(([groupKey, sources]) => (
                            <details key={groupKey} open className="bg-card-light dark:bg-card-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                                <summary className="text-xl font-bold cursor-pointer">{displayMode === 'user' ? (appData.users.find(u => u.id === groupKey)?.pseudonym || 'Desconhecido') : groupKey}</summary>
                                <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark space-y-4">
                                    {sources.sort((a,b) => (b.hot_votes - b.cold_votes) - (a.hot_votes - a.cold_votes)).map(source => <SourceItemContent key={source.id} source={source} />)}
                                </div>
                            </details>
                        ))
                    }
                </div>
             </div>
        </div>
    );
};