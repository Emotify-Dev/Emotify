import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const checkHealth = async () => {
  const { data } = await api.get('/health');
  return data;
};

export const getLoginUrl = async () => {
  const { data } = await api.get('/auth/login');
  return data.url;
};

export const exchangeToken = async (code: string) => {
  const { data } = await api.post('/auth/exchange', { code });
  return data;
};

export const getUserProfile = async () => {
  const token = localStorage.getItem('spotify_token');
  if (!token) throw new Error('No token found');

  const { data } = await api.get('/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return data;
};

export const analyzeFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post('/analyze/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data.emotions;
};

export const analyzeSpotify = async (trackId: string) => {
  const token = localStorage.getItem('spotify_token');

  const { data } = await api.post(
    '/analyze/spotify',
    {
      id: trackId,
      url: null,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return data.emotions;
};
