import '@abraham/reflection';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/app';
import { testbed } from '@lagless/testbed';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

testbed();

root.render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
