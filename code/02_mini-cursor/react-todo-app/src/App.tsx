import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  createdAt: number;
}

type FilterType = 'all' | 'active' | 'completed';

function App() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const saved = localStorage.getItem('react-todo-list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('react-todo-list', JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  const addTodo = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    setTodos(prev => [
      ...prev,
      { id: Date.now(), text, completed: false, createdAt: Date.now() }
    ]);
    setInputValue('');
  }, [inputValue]);

  const deleteTodo = useCallback((id: number) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
  }, []);

  const toggleTodo = useCallback((id: number) => {
    setTodos(prev =>
      prev.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }, []);

  const startEdit = useCallback((todo: Todo) => {
    setEditingId(todo.id);
    setEditValue(todo.text);
  }, []);

  const saveEdit = useCallback(() => {
    const text = editValue.trim();
    if (text && editingId !== null) {
      setTodos(prev =>
        prev.map(todo =>
          todo.id === editingId ? { ...todo, text } : todo
        )
      );
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue]);

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') {
      setEditingId(null);
      setEditValue('');
    }
  };

  const clearCompleted = () => {
    setTodos(prev => prev.filter(todo => !todo.completed));
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  const activeCount = todos.filter(t => !t.completed).length;
  const completedCount = todos.filter(t => t.completed).length;

  return (
    <div className="app-container">
      <div className="todo-card">
        <header className="todo-header">
          <h1>📝 Todo List</h1>
          <p className="subtitle">高效管理你的每一天</p>
        </header>

        <div className="input-section">
          <input
            type="text"
            className="todo-input"
            placeholder="添加新的待办事项..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTodo()}
          />
          <button className="add-btn" onClick={addTodo}>
            添加
          </button>
        </div>

        <div className="filter-section">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              全部
            </button>
            <button
              className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
              onClick={() => setFilter('active')}
            >
              进行中
            </button>
            <button
              className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
              onClick={() => setFilter('completed')}
            >
              已完成
            </button>
          </div>
        </div>

        <div className="stats-section">
          <span className="stat-item">
            📊 总计: <strong>{todos.length}</strong>
          </span>
          <span className="stat-item">
            ⏳ 进行中: <strong>{activeCount}</strong>
          </span>
          <span className="stat-item">
            ✅ 已完成: <strong>{completedCount}</strong>
          </span>
        </div>

        <ul className="todo-list">
          {filteredTodos.length === 0 ? (
            <li className="empty-state">
              {todos.length === 0
                ? '🎉 还没有待办事项，添加一个吧！'
                : '🔍 该分类下没有待办事项'}
            </li>
          ) : (
            filteredTodos.map(todo => (
              <li
                key={todo.id}
                className={`todo-item ${todo.completed ? 'completed' : ''} ${
                  editingId === todo.id ? 'editing' : ''
                }`}
              >
                <div className="todo-content">
                  <label className="checkbox-wrapper">
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleTodo(todo.id)}
                    />
                    <span className="checkmark"></span>
                  </label>

                  {editingId === todo.id ? (
                    <input
                      ref={editInputRef}
                      type="text"
                      className="edit-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleEditKeyDown}
                    />
                  ) : (
                    <span
                      className="todo-text"
                      onDoubleClick={() => startEdit(todo)}
                    >
                      {todo.text}
                    </span>
                  )}
                </div>

                <div className="todo-actions">
                  <button
                    className="action-btn edit-btn"
                    onClick={() => startEdit(todo)}
                    title="编辑"
                  >
                    ✏️
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={() => deleteTodo(todo.id)}
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>

        {completedCount > 0 && (
          <div className="footer-actions">
            <button className="clear-btn" onClick={clearCompleted}>
              清除已完成 ({completedCount})
            </button>
          </div>
        )}

        <footer className="todo-footer">
          <p>💡 双击文本可编辑 | 按 Enter 保存 | 按 Esc 取消</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
