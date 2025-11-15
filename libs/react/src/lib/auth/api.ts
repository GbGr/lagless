import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    get Authorization() {
      return `Bearer ${localStorage.getItem('ll_auth_token') || ''}`;
    }
  },
});
