/// <reference types="vite-plugin-svgr/client" />
import './styles.scss';
import 'pixi.js/advanced-blend-modes';
import 'neutrinoparticles.pixi';
import '@abraham/reflection';
import * as ReactDOM from 'react-dom/client';
import { App } from './app/app';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

if (import.meta.env.DEV) {
  import('eruda').then((eruda) => eruda.default.init());
}

root.render(
  // <StrictMode>
  <App />
  // </StrictMode>
);
