import { useMemo, useState, useEffect, useRef } from 'react';
import './App.css';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { MessagePart } from './components/ToolPanels';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const API_BASE = 'http://192.168.31.49:3000';

function App() {
  const chatUrl = `${API_BASE}/ai/chat`;

  // 创建一个 transport 对象
  const transport = useMemo(() => new DefaultChatTransport({ api: chatUrl }), [chatUrl]);

  const { messages, sendMessage, status, stop, error, clearError } = useChat<UIMessage>({
    transport,
  });
  const [input, setInput] = useState('');

  // 滚动容器的 Ref，直接控制局部容器的滚动条
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const busy = status === 'submitted' || status === 'streaming';
  const canSend = status === 'ready' && input.trim().length > 0;
  const lastAssistant = messages.filter((m) => m.role === 'assistant').at(-1);

  // 统一的发送消息方法
  const handleSend = () => {
    if (!canSend) return;
    void sendMessage({ text: input });
    setInput('');
  };

  // 当消息列表更新或状态变化时，自动滚动到局部容器底部，避免 scrollIntoView 导致整个外部页面晃动
  useEffect(() => {
    const container = chatMessagesRef.current;
    if (container) {
      // 流式输出打字机阶段更新频繁，使用 'auto' 瞬时滚动防止高频 smooth 动画重叠发生抖动
      container.scrollTo({
        top: container.scrollHeight,
        behavior: status === 'streaming' ? 'auto' : 'smooth',
      });
    }
  }, [messages, status]);

  return (
    <div className="chat-app flex h-screen w-full flex-col justify-between overflow-hidden bg-linear-to-br from-[#0e0c12] via-[#16141f] to-[#0e0c12] font-sans text-[#d6cfdf] select-none">
      {/* 顶栏 Header - 采用暗色卡片微透设计，文字对比度调亮 */}
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-white/5 bg-[#171520]/60 px-6 py-4 backdrop-blur-md">
        <div className="flex flex-col text-left">
          <h1
            style={{
              background: 'linear-gradient(to right, #ffffff, #c084fc, #2dd4bf)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            className="text-3xl font-bold tracking-tight"
          >
            Agui-Assistant
          </h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-[#a59cb0] selection:bg-purple-500/30">
            endpoint: {chatUrl}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {busy && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-400"></span>
            </span>
          )}

          {busy && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => stop()}
              className="h-8 gap-1.5 rounded-lg px-3 text-xs font-bold text-white shadow-lg shadow-red-950/20 transition-all active:scale-95"
            >
              <svg
                className="h-3 w-3 fill-current"
                viewBox="0 0 24 24"
              >
                <rect
                  x="4"
                  y="4"
                  width="16"
                  height="16"
                  rx="2"
                />
              </svg>
              停止生成
            </Button>
          )}
        </div>
      </header>

      {/* 核心消息展示区 - 充满屏幕中段，背景稍作暗淡处理突出气泡 */}
      <div
        ref={chatMessagesRef}
        className="flex-1 space-y-6 overflow-y-auto scroll-smooth bg-linear-to-b from-transparent to-[#100e16]/30 px-6 py-6"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-4 py-20 text-center">
            <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl border border-purple-500/30 bg-linear-to-br from-purple-500/20 to-indigo-500/20 shadow-lg shadow-purple-500/10">
              <svg
                className="h-8 w-8 text-purple-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-extrabold tracking-wide text-white">开始新的 AI 对话</h3>
              <p className="max-w-[320px] text-sm text-[#a299ad]">
                输入你的问题，AI 助手将为你提供智能分析与工具调用支持。
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const textPartIndices = message.parts
              .map((p, i) => (p.type === 'text' ? i : -1))
              .filter((i) => i >= 0);
            const lastTextPartIdx = textPartIndices[textPartIndices.length - 1];
            const isUser = message.role === 'user';

            return (
              <article
                key={message.id}
                className={`flex gap-3.5 text-left ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {/* AI 头像 */}
                {!isUser && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-linear-to-br from-purple-500/20 to-violet-500/20 shadow-md">
                    <svg
                      className="h-5 w-5 text-purple-300"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.813 15.904 9 21m0 0-.813-5.096m.813 5.1 1.625-10.194M12 3a9 9 0 0 0-9 9m9-9a9 9 0 0 1 9 9m-9-9v18m9-9a9 9 0 0 1-9 9m9-9H3"
                      />
                    </svg>
                  </div>
                )}

                <div className="flex max-w-[85%] flex-col space-y-1.5">
                  {/* 角色标签 - 调亮配色 */}
                  <span
                    className={`text-[10px] font-extrabold tracking-widest uppercase ${isUser ? 'text-right text-[#c084fc]' : 'text-left text-[#2dd4bf]'}`}
                  >
                    {isUser ? 'YOU' : 'ASSISTANT'}
                  </span>

                  {/* 消息卡片泡 - 对比度与配色优化 */}
                  <div
                    className={`rounded-2xl border px-5 py-3.5 text-sm leading-relaxed shadow-md transition-all ${
                      isUser
                        ? 'rounded-tr-none border-purple-500/35 bg-linear-to-br from-purple-500/20 to-indigo-500/20 text-white'
                        : 'group rounded-tl-none border-white/10 bg-[#1d1b28] text-[#f3effa] hover:border-purple-500/30'
                    }`}
                  >
                    <div className="chat-body">
                      {message.parts.map((part, index) => (
                        <MessagePart
                          key={`${message.id}-p-${index}`}
                          part={part}
                          textStreamActive={
                            part.type === 'text' &&
                            message.role === 'assistant' &&
                            message.id === lastAssistant?.id &&
                            index === lastTextPartIdx &&
                            busy
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* 用户头像 */}
                {isUser && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-500/30 bg-linear-to-br from-teal-500/20 to-emerald-500/20 shadow-md">
                    <svg
                      className="h-5 w-5 text-teal-300"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                      />
                    </svg>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* 错误警报展示栏 - 卡片全宽自适应，文字调亮 */}
      {error && (
        <div
          className="mx-6 my-2 flex items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3.5 text-sm text-red-200 shadow-lg backdrop-blur-md"
          role="alert"
        >
          <div className="flex items-center gap-2.5 text-left">
            <svg
              className="h-5 w-5 shrink-0 text-red-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <span className="font-semibold">{error.message}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => clearError()}
            className="h-7 rounded-md px-2.5 text-xs font-bold text-red-200 transition-all hover:bg-red-500/20 hover:text-white"
          >
            关闭
          </Button>
        </div>
      )}

      {/* 底部一体化输入表单 - 横向铺满，提供更加舒适的输入空间 */}
      <form
        className="shrink-0 border-t border-white/5 bg-[#171520]/60 p-6 backdrop-blur-md"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        {/* 输入框包裹容器 - Focus 时的紫色呼吸微光 */}
        <div className="relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1b1926] shadow-inner transition-all focus-within:border-purple-500/50 focus-within:ring-2 focus-within:ring-purple-500/10">
          <Textarea
            className="w-full resize-none border-0 bg-transparent px-4 py-3.5 text-base text-white placeholder-[#8e859a] shadow-none focus:outline-none focus-visible:ring-0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入你的消息。Enter 发送，Shift+Enter 换行"
            rows={3}
            disabled={status !== 'ready'}
            aria-label="消息输入"
          />

          {/* 底部动作状态条 - 文字高明度优化 */}
          <div className="flex items-center justify-between bg-transparent px-4 pt-1.5 pb-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[#a59eb0] select-none">
              {status === 'ready' && (
                <>
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500"></span>
                  助手已就绪
                </>
              )}
              {status === 'submitted' && (
                <>
                  <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-purple-400"></span>
                  发送中…
                </>
              )}
              {status === 'streaming' && (
                <>
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400"></span>
                  AI 正在思考生成…
                </>
              )}
              {status === 'error' && (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500"></span>
                  发生错误
                </>
              )}
            </span>

            <Button
              type="submit"
              disabled={!canSend}
              variant="premium"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-xs font-bold text-white shadow-lg transition-all active:scale-95"
            >
              <span>发送</span>
              <svg
                className="h-3.5 w-3.5 fill-current"
                viewBox="0 0 24 24"
              >
                <path d="M3.4 22a.8.8 0 0 1-.7-1.1L6.6 12 2.7 3.1a.8.8 0 0 1 1-.9l18 9a.8.8 0 0 1 0 1.6l-18 9a.8.8 0 0 1-.3.2zM5.3 5.1l2.6 6.1h7.8a.8.8 0 0 1 0 1.6H7.9l-2.6 6.1L19.4 12z" />
              </svg>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default App;
