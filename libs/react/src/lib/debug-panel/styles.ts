import type { CSSProperties } from 'react';

export const panelStyles: Record<string, CSSProperties> = {
  panel: {
    position: 'fixed',
    bottom: 8,
    right: 8,
    padding: '8px 10px',
    fontFamily: "'Courier New', monospace",
    fontSize: 11,
    lineHeight: '1.5',
    color: '#c8ffc8',
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 1000,
    whiteSpace: 'pre',
    maxWidth: 280,
    maxHeight: '60vh',
    overflow: 'auto',
  },
  title: {
    color: '#ffcc00',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  section: {
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#88aaff',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  label: {
    color: '#88aaff',
  },
  button: {
    marginRight: 4,
    padding: '2px 8px',
    fontSize: 10,
    cursor: 'pointer',
    background: '#333',
    color: '#eee',
    border: '1px solid #666',
    borderRadius: 3,
  },
};
