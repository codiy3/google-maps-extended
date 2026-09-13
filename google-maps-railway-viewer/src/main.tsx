import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('起動用の要素がありません。');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
