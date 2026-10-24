import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  InterfaceProvider,
  consonaThemeExtender,
  Toast,
} from '@consona/interface';
import { App } from './App.tsx';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <InterfaceProvider
        theme={{ defaultTheme: 'dark', extenders: [consonaThemeExtender] }}
      >
        <App />
        <Toast position="bottom-right" />
      </InterfaceProvider>
    </React.StrictMode>
  );
}
