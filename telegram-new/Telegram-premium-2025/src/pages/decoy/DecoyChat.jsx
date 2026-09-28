import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDecoy } from '../../context/DecoyContext';
import { useDecoySocket } from '../../hooks/useDecoySocket';
import Spinner from '../dashboard/components/common/spinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft, faRobot, faPause, faPlay, faPaperPlane, faKeyboard,
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'react-toastify';
import MediaModal from '../../components/decoy/MediaModal';

function StatusBadge({ status }) {
  const colors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/40',
    paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
    stopped: 'bg-red-500/20 text-red-400 border-red-500/40',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[status] ?? colors.stopped}`}>
      {status}
    </span>
  );
}

function MediaContent({ msg, onMediaClick }) {
  const { mediaUrl, mediaKind } = msg;
  if (!mediaUrl) return null;

  if (!mediaKind || mediaKind === 'photo' || mediaKind === 'sticker' || mediaKind === 'gif') {
    return (
      <div className="mb-2">
        <img
          src={mediaUrl}
          alt="media"
          loading="lazy"
          onClick={() => onMediaClick && onMediaClick(mediaUrl, mediaKind || 'photo')}
          className="w-full rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
        />
      </div>
    );
  }
  if (mediaKind === 'video') {
    return (
      <div className="mb-2 relative cursor-pointer hover:opacity-90 transition-opacity group" onClick={() => onMediaClick && onMediaClick(mediaUrl, mediaKind)}>
        <video src={mediaUrl} preload="metadata" className="w-full rounded-lg max-h-64" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 rounded-lg transition-colors">
          <svg className="w-10 h-10 text-white opacity-80" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    );
  }
  if (mediaKind === 'audio') {
    return (
      <div className="mb-2">
        <audio src={mediaUrl} controls className="w-full" />
      </div>
    );
  }
  return (
    <div className="mb-2">
      <a
        href={mediaUrl}
        download
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-600/20 border border-primary-500/40 rounded-lg text-xs font-medium text-primary-400 hover:bg-primary-600/30 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download File
      </a>
    </div>
  );
}

function ChatBubble({ msg, onMediaClick }) {
  const isOutgoing = msg.role === 'ai' || msg.role === 'manual';
  const isManual = msg.role === 'manual';

  const bubbleStyle = isManual
    ? 'bg-indigo-600/30 border border-indigo-500/40 text-white rounded-br-none'
    : isOutgoing
    ? 'bg-primary-600/30 border border-primary-500/40 text-white rounded-br-none'
    : 'bg-gray-800 border border-gray-700 text-gray-200 rounded-bl-none';

  const label = isManual ? 'You (manual)' : isOutgoing ? 'Bot' : 'Target';

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${bubbleStyle}`}>
        <div className="text-xs mb-1 opacity-50">{label}</div>
        <MediaContent msg={msg} onMediaClick={onMediaClick} />
        {msg.content && msg.content !== '[Image]' && (
          <div className="whitespace-pre-wrap">{msg.content}</div>
        )}
        {!msg.mediaUrl && msg.content === '[Image]' && (
          <div className="whitespace-pre-wrap opacity-60 italic">[Image]</div>
        )}
        <div className="text-xs mt-1 opacity-40 text-right">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default function DecoyChat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sessions, fetchMessages, pauseSession, resumeSession, manualSend } = useDecoy();
  const session = sessions.find((s) => s._id === id);

  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [status, setStatus] = useState(session?.status ?? 'active');
  const [actioning, setActioning] = useState(false);
  const [manualText, setManualText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMedia, setModalMedia] = useState({ url: null, kind: null });

  const handleMediaClick = (url, kind) => {
    setModalMedia({ url, kind });
    setModalOpen(true);
  };

  useEffect(() => {
    if (session) setStatus(session.status);
  }, [session?.status]);

  useEffect(() => {
    fetchMessages(id)
      .then(setMessages)
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoadingMsgs(false));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useDecoySocket({
    sessionId: id,
    onMessage: (msg) => setMessages((prev) => [...prev, msg]),
    onStatus: ({ status: s }) => setStatus(s),
  });

  const handlePause = async () => {
    setActioning(true);
    try {
      await pauseSession(id);
      setStatus('paused');
      toast.success('Session paused');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to pause session');
    } finally {
      setActioning(false);
    }
  };

  const handleResume = async () => {
    setActioning(true);
    try {
      await resumeSession(id);
      setStatus('active');
      toast.success('Session resumed — bot is active');
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to resume session');
    } finally {
      setActioning(false);
    }
  };

  const handleManualSend = async (e) => {
    e.preventDefault();
    const text = manualText.trim();
    if (!text) return;

    setSending(true);
    try {
      // Auto-pause the bot before sending manually
      if (status === 'active') {
        await pauseSession(id);
        setStatus('paused');
      }
      const msg = await manualSend(id, text);
      if (msg) setMessages((prev) => [...prev, msg]);
      setManualText('');
      inputRef.current?.focus();
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const canSend = status !== 'stopped';

  return (
    <div className="flex flex-col h-full bg-[rgb(0_8_15)] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800 shrink-0">
        <button onClick={() => navigate('/group/decoy')} className="text-gray-400 hover:text-white transition-colors">
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <FontAwesomeIcon icon={faRobot} className="text-primary-400" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{session?.targetName ?? session?.targetIdentifier ?? id}</div>
          <div className="text-xs text-gray-500 truncate">{session?.targetIdentifier}</div>
        </div>
        <StatusBadge status={status} />
        <div className="flex gap-2 shrink-0">
          {status === 'active' && (
            <button
              onClick={handlePause}
              disabled={actioning}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
            >
              {actioning ? <Spinner className="size-3" /> : <FontAwesomeIcon icon={faPause} />}
              Pause
            </button>
          )}
          {status === 'paused' && (
            <button
              onClick={handleResume}
              disabled={actioning}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-green-500/20 border border-green-500/40 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50"
            >
              {actioning ? <Spinner className="size-3" /> : <FontAwesomeIcon icon={faPlay} />}
              Resume Bot
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loadingMsgs ? (
          <div className="flex justify-center items-center h-full">
            <Spinner className="size-6" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center items-center h-full text-gray-600 text-sm">
            Session started — bot will send an opening message shortly.
          </div>
        ) : (
          messages.map((msg, i) => <ChatBubble key={i} msg={msg} onMediaClick={handleMediaClick} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer — status bar or manual input */}
      {status === 'stopped' ? (
        <div className="px-5 py-3 border-t border-gray-800 text-xs text-red-500/60 text-center shrink-0">
          Session stopped — start a new session to continue
        </div>
      ) : (
        <form
          onSubmit={handleManualSend}
          className="flex items-end gap-3 px-4 py-3 border-t border-gray-800 shrink-0"
        >
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleManualSend(e);
                }
              }}
              placeholder={
                status === 'active'
                  ? 'Type to take over manually (auto-pauses bot)…'
                  : 'Type a message to send as the bot…'
              }
              rows={1}
              disabled={!canSend || sending}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none disabled:opacity-50"
              style={{ minHeight: '42px', maxHeight: '120px' }}
            />
            {status === 'active' && (
              <span className="absolute right-3 top-2.5 text-xs text-yellow-500/60 flex items-center gap-1 pointer-events-none">
                <FontAwesomeIcon icon={faKeyboard} />
                pauses bot
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!manualText.trim() || !canSend || sending}
            className="h-10 w-10 flex items-center justify-center bg-primary-600 text-white rounded-xl hover:bg-primary-500 transition-colors disabled:opacity-40 shrink-0"
          >
            {sending ? <Spinner className="size-4" /> : <FontAwesomeIcon icon={faPaperPlane} />}
          </button>
        </form>
      )}

      {/* Bot active hint above input */}
      {status === 'active' && (
        <div className="px-5 pb-2 text-xs text-gray-600 text-center -mt-1 shrink-0">
          Bot is active — replies are sent automatically
        </div>
      )}

      <MediaModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        mediaUrl={modalMedia.url} 
        mediaKind={modalMedia.kind} 
      />
    </div>
  );
}
